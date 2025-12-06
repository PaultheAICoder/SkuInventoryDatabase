import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, validateUserExists } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import {
  created,
  paginated,
  unauthorized,
  conflict,
  serverError,
  parseBody,
  parseQuery,
  error,
} from '@/lib/api-response'
import { createSKUSchema, skuListQuerySchema } from '@/types/sku'
import { calculateBOMUnitCosts, calculateMaxBuildableUnitsForSKUs } from '@/services/bom'
import { getSkuQuantities } from '@/services/finished-goods'
import { parseFractionOrNumber } from '@/lib/utils'

// GET /api/skus - List SKUs with filtering and pagination
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { searchParams } = new URL(request.url)
    const queryResult = parseQuery(searchParams, skuListQuerySchema)
    if (queryResult.error) return queryResult.error

    const { page, pageSize, search, salesChannel, isActive, sortBy, sortOrder } = queryResult.data
    const locationId = searchParams.get('locationId') ?? undefined

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    // Get selected brand (may be null for "all brands")
    const selectedBrandId = session.user.selectedBrandId

    // Build where clause - scope by companyId and optionally brandId
    const where: Prisma.SKUWhereInput = {
      companyId: selectedCompanyId,
      // Only add brandId filter if a specific brand is selected
      ...(selectedBrandId && { brandId: selectedBrandId }),
      ...(isActive !== undefined && { isActive }),
      ...(salesChannel && { salesChannel }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { internalCode: { contains: search, mode: 'insensitive' } },
        ],
      }),
    }

    // Get total count
    const total = await prisma.sKU.count({ where })

    // Get SKUs with active BOM
    const skus = await prisma.sKU.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { [sortBy]: sortOrder },
      include: {
        createdBy: { select: { id: true, name: true } },
        bomVersions: {
          where: { isActive: true },
          take: 1,
          select: {
            id: true,
            versionName: true,
          },
        },
      },
    })

    // Get BOM costs and buildable units
    const skuIds = skus.map((s) => s.id)
    const activeBomIds = skus
      .filter((s) => s.bomVersions[0])
      .map((s) => s.bomVersions[0].id)

    const [bomCosts, buildableUnits, finishedGoodsQtys] = await Promise.all([
      activeBomIds.length > 0 ? calculateBOMUnitCosts(activeBomIds, selectedCompanyId!) : new Map<string, number>(),
      skuIds.length > 0 ? calculateMaxBuildableUnitsForSKUs(skuIds, selectedCompanyId!, locationId) : new Map<string, number | null>(),
      skuIds.length > 0 ? getSkuQuantities(skuIds, locationId) : new Map<string, number>(),
    ])

    // Transform response
    const data = skus.map((sku) => {
      const activeBom = sku.bomVersions[0]
      const unitCost = activeBom ? bomCosts.get(activeBom.id) ?? 0 : null

      return {
        id: sku.id,
        name: sku.name,
        internalCode: sku.internalCode,
        salesChannel: sku.salesChannel,
        externalIds: sku.externalIds as Record<string, string>,
        notes: sku.notes,
        isActive: sku.isActive,
        createdAt: sku.createdAt.toISOString(),
        updatedAt: sku.updatedAt.toISOString(),
        createdBy: sku.createdBy,
        activeBom: activeBom
          ? {
              id: activeBom.id,
              versionName: activeBom.versionName,
              unitCost: unitCost?.toFixed(4) ?? '0.0000',
            }
          : null,
        maxBuildableUnits: buildableUnits.get(sku.id) ?? null,
        finishedGoodsQuantity: finishedGoodsQtys.get(sku.id) ?? 0,
      }
    })

    return paginated(data, total, page, pageSize)
  } catch (error) {
    console.error('Error listing SKUs:', error)
    return serverError()
  }
}

// POST /api/skus - Create a new SKU
export async function POST(request: NextRequest) {
  // Store context for error logging
  let errorContext: {
    userId?: string
    companyId?: string | null
    brandId?: string | null
    internalCode?: string
  } = {}

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    // Store session info for error logging
    errorContext = {
      userId: session.user.id,
      companyId: session.user.selectedCompanyId,
      brandId: session.user.selectedBrandId,
    }

    // Validate session has required company context
    if (!session.user.selectedCompanyId) {
      console.error('SKU creation failed: No selectedCompanyId in session', {
        userId: session.user.id,
        email: session.user.email,
      })
      return error('Company context is required. Please select a company and try again.', 400, 'BadRequest')
    }

    // Defense-in-depth: Validate user still exists in database
    // Note: This check is now also performed in the JWT callback (auth.ts) which invalidates
    // tokens for deleted/deactivated users. This route-level check provides an additional
    // layer of protection for critical write operations like SKU creation.
    // See Issue #192: Stale Authentication (JWT) Persists After User Deletion
    const validUser = await validateUserExists(session.user.id)
    if (!validUser) {
      console.error('SKU creation failed: User ID not found in database (stale JWT token)', {
        userId: session.user.id,
        email: session.user.email,
      })
      return error('Your session has expired. Please log out and log back in.', 401, 'Unauthorized')
    }
    if (!validUser.isActive) {
      console.error('SKU creation failed: User is inactive', {
        userId: session.user.id,
        email: session.user.email,
      })
      return error('Your account is inactive. Please contact an administrator.', 403, 'Forbidden')
    }

    const bodyResult = await parseBody(request, createSKUSchema)
    if (bodyResult.error) return bodyResult.error

    const data = bodyResult.data
    errorContext.internalCode = data.internalCode

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    // Use selected brand from session, or fall back to first active brand
    let brandId = session.user.selectedBrandId

    if (!brandId) {
      // Fall back to first active brand if none selected
      const brand = await prisma.brand.findFirst({
        where: { companyId: selectedCompanyId, isActive: true },
      })
      if (!brand) {
        return serverError('No active brand found for selected company')
      }
      brandId = brand.id
    } else {
      // Validate brand belongs to selected company
      const validBrand = await prisma.brand.findFirst({
        where: {
          id: brandId,
          companyId: selectedCompanyId,
          isActive: true,
        },
      })

      if (!validBrand) {
        console.error('SKU creation failed: Brand does not belong to company', {
          brandId,
          companyId: selectedCompanyId,
        })
        return error('Invalid brand selection. Please refresh the page and try again.', 400, 'BadRequest')
      }
    }

    // Check for duplicate internalCode within the selected company
    const existing = await prisma.sKU.findFirst({
      where: {
        companyId: selectedCompanyId,
        internalCode: data.internalCode,
      },
    })

    if (existing) {
      return conflict('A SKU with this internal code already exists')
    }

    // Check if BOM lines are provided
    const hasBomLines = data.bomLines && data.bomLines.length > 0

    if (hasBomLines) {
      // Create SKU and BOM version in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create SKU
        const sku = await tx.sKU.create({
          data: {
            brandId,
            companyId: selectedCompanyId,
            name: data.name,
            internalCode: data.internalCode,
            salesChannel: data.salesChannel,
            externalIds: data.externalIds as Prisma.InputJsonValue,
            notes: data.notes,
            createdById: session.user.id,
            updatedById: session.user.id,
          },
          include: {
            createdBy: { select: { id: true, name: true } },
          },
        })

        // Create BOM version with lines
        const bomVersion = await tx.bOMVersion.create({
          data: {
            skuId: sku.id,
            versionName: 'v1',
            effectiveStartDate: new Date(),
            isActive: true,
            createdById: session.user.id,
            lines: {
              create: data.bomLines!.map((line) => ({
                componentId: line.componentId,
                quantityPerUnit: parseFractionOrNumber(line.quantityPerUnit) ?? 1,
              })),
            },
          },
        })

        return { sku, bomVersion }
      })

      return created({
        id: result.sku.id,
        name: result.sku.name,
        internalCode: result.sku.internalCode,
        salesChannel: result.sku.salesChannel,
        externalIds: result.sku.externalIds as Record<string, string>,
        notes: result.sku.notes,
        isActive: result.sku.isActive,
        createdAt: result.sku.createdAt.toISOString(),
        updatedAt: result.sku.updatedAt.toISOString(),
        createdBy: result.sku.createdBy,
        activeBom: {
          id: result.bomVersion.id,
          versionName: result.bomVersion.versionName,
          unitCost: '0.0000', // Will be calculated on refresh
        },
        maxBuildableUnits: null,
      })
    }

    // No BOM lines - create SKU only (existing behavior)
    const sku = await prisma.sKU.create({
      data: {
        brandId,
        companyId: selectedCompanyId,
        name: data.name,
        internalCode: data.internalCode,
        salesChannel: data.salesChannel,
        externalIds: data.externalIds as Prisma.InputJsonValue,
        notes: data.notes,
        createdById: session.user.id,
        updatedById: session.user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    })

    return created({
      id: sku.id,
      name: sku.name,
      internalCode: sku.internalCode,
      salesChannel: sku.salesChannel,
      externalIds: sku.externalIds as Record<string, string>,
      notes: sku.notes,
      isActive: sku.isActive,
      createdAt: sku.createdAt.toISOString(),
      updatedAt: sku.updatedAt.toISOString(),
      createdBy: sku.createdBy,
      activeBom: null,
      maxBuildableUnits: null,
    })
  } catch (err) {
    // Log detailed error for debugging
    const errorDetails = {
      message: err instanceof Error ? err.message : 'Unknown error',
      stack: err instanceof Error ? err.stack : undefined,
      name: err instanceof Error ? err.name : undefined,
      ...errorContext,
    }
    console.error('Error creating SKU:', JSON.stringify(errorDetails, null, 2))

    // Return user-friendly message based on error type
    if (err instanceof Error && err.message.includes('Unique constraint')) {
      return conflict('A SKU with this internal code already exists')
    }

    // Handle FK constraint violations (e.g., stale user ID in JWT)
    if (err instanceof Error && err.message.includes('Foreign key constraint')) {
      if (err.message.includes('createdById') || err.message.includes('updatedById')) {
        return error('Your session has expired. Please log out and log back in.', 401, 'Unauthorized')
      }
      if (err.message.includes('brandId')) {
        return error('Invalid brand selection. Please refresh the page and try again.', 400, 'BadRequest')
      }
      if (err.message.includes('companyId')) {
        return error('Company context is invalid. Please log out and log back in.', 400, 'BadRequest')
      }
    }

    return serverError('Failed to create SKU. Please try again or contact support.')
  }
}
