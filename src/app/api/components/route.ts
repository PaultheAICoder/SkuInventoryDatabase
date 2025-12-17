import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import {
  created,
  paginated,
  unauthorized,
  serverError,
  parseBody,
  parseQuery,
  error,
} from '@/lib/api-response'
import { createComponentSchema, componentListQuerySchema } from '@/types/component'
import { getComponentQuantities, calculateReorderStatus, getCompanySettings, getComponentsWithReorderStatus } from '@/services/inventory'

// GET /api/components - List components with filtering and pagination
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { searchParams } = new URL(request.url)
    const queryResult = parseQuery(searchParams, componentListQuerySchema)
    if (queryResult.error) return queryResult.error

    const { page, pageSize, search, category, isActive, reorderStatus, sortBy, sortOrder, locationId } =
      queryResult.data

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    // Get selected brand (may be null for "all brands")
    const selectedBrandId = session.user.selectedBrandId

    // Get company settings
    const settings = await getCompanySettings(selectedCompanyId)

    // Build where clause - scope by companyId and optionally brandId
    const where: Prisma.ComponentWhereInput = {
      companyId: selectedCompanyId,
      // Only add brandId filter if a specific brand is selected
      ...(selectedBrandId && { brandId: selectedBrandId }),
      ...(isActive !== undefined && { isActive }),
      ...(category && { category }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { skuCode: { contains: search, mode: 'insensitive' } },
        ],
      }),
    }

    // When filtering by reorderStatus, use DB-side computation
    // This avoids loading all components into memory for large datasets
    if (reorderStatus) {
      const result = await getComponentsWithReorderStatus({
        companyId: selectedCompanyId,
        brandId: selectedBrandId || undefined,
        page,
        pageSize,
        sortBy,
        sortOrder,
        search,
        category,
        isActive,
        reorderStatus,
        locationId,
        reorderWarningMultiplier: settings.reorderWarningMultiplier,
      })

      return paginated(result.data, result.total, page, pageSize)
    }

    // Original logic for non-reorderStatus queries
    const total = await prisma.component.count({ where })

    const components = await prisma.component.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { [sortBy]: sortOrder },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    })

    // Get quantities for all components (filtered by location if specified)
    const componentIds = components.map((c) => c.id)
    const quantities = await getComponentQuantities(componentIds, selectedCompanyId!, locationId)

    // Transform response with computed fields
    const data = components.map((component) => {
      const quantityOnHand = quantities.get(component.id) ?? 0
      const status = calculateReorderStatus(quantityOnHand, component.reorderPoint, settings.reorderWarningMultiplier)

      return {
        id: component.id,
        name: component.name,
        skuCode: component.skuCode,
        category: component.category,
        unitOfMeasure: component.unitOfMeasure,
        costPerUnit: component.costPerUnit.toString(),
        reorderPoint: component.reorderPoint,
        leadTimeDays: component.leadTimeDays,
        notes: component.notes,
        isActive: component.isActive,
        quantityOnHand,
        reorderStatus: status,
        createdAt: component.createdAt.toISOString(),
        updatedAt: component.updatedAt.toISOString(),
        createdBy: component.createdBy,
      }
    })

    return paginated(data, total, page, pageSize)
  } catch (error) {
    console.error('Error listing components:', error)
    return serverError()
  }
}

// POST /api/components - Create a new component
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const bodyResult = await parseBody(request, createComponentSchema)
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

    // Get company settings
    const settings = await getCompanySettings(selectedCompanyId)

    // Check for duplicate name or skuCode within the selected company
    const existing = await prisma.component.findFirst({
      where: {
        companyId: selectedCompanyId,
        OR: [{ name: data.name }, { skuCode: data.skuCode }],
      },
    })

    if (existing) {
      if (existing.name === data.name) {
        return error(
          'A component with this name already exists',
          409,
          'Conflict',
          [{ field: 'name', message: 'This name is already in use' }]
        )
      }
      return error(
        'A component with this SKU code already exists',
        409,
        'Conflict',
        [{ field: 'skuCode', message: 'This SKU code is already in use' }]
      )
    }

    const component = await prisma.component.create({
      data: {
        brandId,
        companyId: selectedCompanyId,
        name: data.name,
        skuCode: data.skuCode,
        category: data.category,
        unitOfMeasure: data.unitOfMeasure,
        costPerUnit: new Prisma.Decimal(data.costPerUnit),
        reorderPoint: data.reorderPoint,
        // Use settings default if leadTimeDays not provided (0 or undefined)
        leadTimeDays: data.leadTimeDays || settings.defaultLeadTimeDays,
        notes: data.notes,
        createdById: session.user.id,
        updatedById: session.user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    })

    return created({
      id: component.id,
      name: component.name,
      skuCode: component.skuCode,
      category: component.category,
      unitOfMeasure: component.unitOfMeasure,
      costPerUnit: component.costPerUnit.toString(),
      reorderPoint: component.reorderPoint,
      leadTimeDays: component.leadTimeDays,
      notes: component.notes,
      isActive: component.isActive,
      quantityOnHand: 0,
      reorderStatus: calculateReorderStatus(0, component.reorderPoint, settings.reorderWarningMultiplier),
      createdAt: component.createdAt.toISOString(),
      updatedAt: component.updatedAt.toISOString(),
      createdBy: component.createdBy,
    })
  } catch (error) {
    console.error('Error creating component:', error)
    return serverError()
  }
}
