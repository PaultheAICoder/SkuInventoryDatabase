import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import {
  success,
  created,
  paginated,
  unauthorized,
  validationError,
  conflict,
  serverError,
  parseBody,
  parseQuery,
} from '@/lib/api-response'
import { createComponentSchema, componentListQuerySchema } from '@/types/component'
import { getComponentQuantities, calculateReorderStatus } from '@/services/inventory'

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

    const { page, pageSize, search, category, isActive, reorderStatus, sortBy, sortOrder } =
      queryResult.data

    // Get user's brand
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { company: { include: { brands: { where: { isActive: true }, take: 1 } } } },
    })

    if (!user?.company.brands[0]) {
      return success([])
    }

    const brandId = user.company.brands[0].id

    // Build where clause
    const where: Prisma.ComponentWhereInput = {
      brandId,
      ...(isActive !== undefined && { isActive }),
      ...(category && { category }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { skuCode: { contains: search, mode: 'insensitive' } },
        ],
      }),
    }

    // Get total count
    const total = await prisma.component.count({ where })

    // Get components
    const components = await prisma.component.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { [sortBy]: sortOrder },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    })

    // Get quantities for all components
    const componentIds = components.map((c) => c.id)
    const quantities = await getComponentQuantities(componentIds)

    // Transform response with computed fields
    const data = components.map((component) => {
      const quantityOnHand = quantities.get(component.id) ?? 0
      const status = calculateReorderStatus(quantityOnHand, component.reorderPoint)

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

    // Filter by reorder status if specified (post-query filter since it's computed)
    const filteredData = reorderStatus
      ? data.filter((c) => c.reorderStatus === reorderStatus)
      : data

    return paginated(filteredData, reorderStatus ? filteredData.length : total, page, pageSize)
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

    // Get user's brand
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { company: { include: { brands: { where: { isActive: true }, take: 1 } } } },
    })

    if (!user?.company.brands[0]) {
      return serverError('No active brand found')
    }

    const brandId = user.company.brands[0].id

    // Check for duplicate name or skuCode
    const existing = await prisma.component.findFirst({
      where: {
        brandId,
        OR: [{ name: data.name }, { skuCode: data.skuCode }],
      },
    })

    if (existing) {
      if (existing.name === data.name) {
        return conflict('A component with this name already exists')
      }
      return conflict('A component with this SKU code already exists')
    }

    const component = await prisma.component.create({
      data: {
        brandId,
        name: data.name,
        skuCode: data.skuCode,
        category: data.category,
        unitOfMeasure: data.unitOfMeasure,
        costPerUnit: new Prisma.Decimal(data.costPerUnit),
        reorderPoint: data.reorderPoint,
        leadTimeDays: data.leadTimeDays,
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
      reorderStatus: calculateReorderStatus(0, component.reorderPoint),
      createdAt: component.createdAt.toISOString(),
      updatedAt: component.updatedAt.toISOString(),
      createdBy: component.createdBy,
    })
  } catch (error) {
    console.error('Error creating component:', error)
    return serverError()
  }
}
