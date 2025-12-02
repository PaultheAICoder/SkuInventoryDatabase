import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import {
  success,
  unauthorized,
  notFound,
  conflict,
  serverError,
  parseBody,
} from '@/lib/api-response'
import { updateComponentSchema } from '@/types/component'
import {
  getComponentQuantity,
  calculateReorderStatus,
  canDeleteComponent,
} from '@/services/inventory'

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/components/:id - Get component details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { id } = await params

    const component = await prisma.component.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true } },
        updatedBy: { select: { id: true, name: true } },
        bomLines: {
          where: { bomVersion: { isActive: true } },
          include: {
            bomVersion: {
              include: {
                sku: { select: { id: true, name: true } },
              },
            },
          },
        },
        transactionLines: {
          take: 10,
          orderBy: { transaction: { createdAt: 'desc' } },
          include: {
            transaction: {
              select: {
                id: true,
                type: true,
                date: true,
                createdAt: true,
              },
            },
          },
        },
      },
    })

    if (!component) {
      return notFound('Component')
    }

    const quantityOnHand = await getComponentQuantity(id)

    return success({
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
      reorderStatus: calculateReorderStatus(quantityOnHand, component.reorderPoint),
      createdAt: component.createdAt.toISOString(),
      updatedAt: component.updatedAt.toISOString(),
      createdBy: component.createdBy,
      updatedBy: component.updatedBy,
      usedInSkus: component.bomLines.map((line) => ({
        id: line.bomVersion.sku.id,
        name: line.bomVersion.sku.name,
        quantityPerUnit: line.quantityPerUnit.toString(),
      })),
      recentTransactions: component.transactionLines.map((line) => ({
        id: line.transaction.id,
        type: line.transaction.type,
        date: line.transaction.date.toISOString(),
        quantityChange: line.quantityChange.toString(),
        createdAt: line.transaction.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('Error getting component:', error)
    return serverError()
  }
}

// PATCH /api/components/:id - Update component
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { id } = await params

    const bodyResult = await parseBody(request, updateComponentSchema)
    if (bodyResult.error) return bodyResult.error

    const data = bodyResult.data

    // Check component exists
    const existing = await prisma.component.findUnique({
      where: { id },
    })

    if (!existing) {
      return notFound('Component')
    }

    // Check for duplicate name or skuCode if changed
    if (data.name || data.skuCode) {
      const duplicate = await prisma.component.findFirst({
        where: {
          brandId: existing.brandId,
          id: { not: id },
          OR: [
            ...(data.name ? [{ name: data.name }] : []),
            ...(data.skuCode ? [{ skuCode: data.skuCode }] : []),
          ],
        },
      })

      if (duplicate) {
        if (data.name && duplicate.name === data.name) {
          return conflict('A component with this name already exists')
        }
        if (data.skuCode && duplicate.skuCode === data.skuCode) {
          return conflict('A component with this SKU code already exists')
        }
      }
    }

    const component = await prisma.component.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.skuCode !== undefined && { skuCode: data.skuCode }),
        ...(data.category !== undefined && { category: data.category }),
        ...(data.unitOfMeasure !== undefined && { unitOfMeasure: data.unitOfMeasure }),
        ...(data.costPerUnit !== undefined && { costPerUnit: new Prisma.Decimal(data.costPerUnit) }),
        ...(data.reorderPoint !== undefined && { reorderPoint: data.reorderPoint }),
        ...(data.leadTimeDays !== undefined && { leadTimeDays: data.leadTimeDays }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        updatedById: session.user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    })

    const quantityOnHand = await getComponentQuantity(id)

    return success({
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
      reorderStatus: calculateReorderStatus(quantityOnHand, component.reorderPoint),
      createdAt: component.createdAt.toISOString(),
      updatedAt: component.updatedAt.toISOString(),
      createdBy: component.createdBy,
    })
  } catch (error) {
    console.error('Error updating component:', error)
    return serverError()
  }
}

// DELETE /api/components/:id - Soft delete (deactivate) component
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { id } = await params

    // Check component exists
    const existing = await prisma.component.findUnique({
      where: { id },
    })

    if (!existing) {
      return notFound('Component')
    }

    // Check if used in active BOMs
    const canDelete = await canDeleteComponent(id)
    if (!canDelete) {
      return conflict('Cannot deactivate component that is used in active BOMs')
    }

    await prisma.component.update({
      where: { id },
      data: {
        isActive: false,
        updatedById: session.user.id,
      },
    })

    return success({ message: 'Component deactivated' })
  } catch (error) {
    console.error('Error deleting component:', error)
    return serverError()
  }
}
