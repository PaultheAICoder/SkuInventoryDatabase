import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
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
} from '@/lib/api-response'
import { createSKUSchema, skuListQuerySchema } from '@/types/sku'
import { calculateBOMUnitCosts, calculateMaxBuildableUnitsForSKUs } from '@/services/bom'

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

    const [bomCosts, buildableUnits] = await Promise.all([
      activeBomIds.length > 0 ? calculateBOMUnitCosts(activeBomIds) : new Map<string, number>(),
      skuIds.length > 0 ? calculateMaxBuildableUnitsForSKUs(skuIds, locationId) : new Map<string, number | null>(),
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
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const bodyResult = await parseBody(request, createSKUSchema)
    if (bodyResult.error) return bodyResult.error

    const data = bodyResult.data

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
  } catch (error) {
    console.error('Error creating SKU:', error)
    return serverError()
  }
}
