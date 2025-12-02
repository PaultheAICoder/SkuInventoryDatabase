import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { ReorderStatus } from '@/types'

/**
 * Calculate the on-hand quantity for a component by summing all transaction lines
 */
export async function getComponentQuantity(componentId: string): Promise<number> {
  const result = await prisma.transactionLine.aggregate({
    where: { componentId },
    _sum: { quantityChange: true },
  })
  return result._sum.quantityChange?.toNumber() ?? 0
}

/**
 * Calculate quantities for multiple components at once
 */
export async function getComponentQuantities(
  componentIds: string[]
): Promise<Map<string, number>> {
  const results = await prisma.transactionLine.groupBy({
    by: ['componentId'],
    where: { componentId: { in: componentIds } },
    _sum: { quantityChange: true },
  })

  const quantities = new Map<string, number>()
  for (const result of results) {
    quantities.set(result.componentId, result._sum.quantityChange?.toNumber() ?? 0)
  }

  // Ensure all requested components have an entry (even if 0)
  for (const id of componentIds) {
    if (!quantities.has(id)) {
      quantities.set(id, 0)
    }
  }

  return quantities
}

/**
 * Calculate reorder status based on quantity and reorder point
 * Critical: quantity <= reorderPoint
 * Warning: quantity <= reorderPoint * 1.5
 * OK: quantity > reorderPoint * 1.5
 */
export function calculateReorderStatus(
  quantityOnHand: number,
  reorderPoint: number
): ReorderStatus {
  if (reorderPoint === 0) {
    return 'ok'
  }
  if (quantityOnHand <= reorderPoint) {
    return 'critical'
  }
  if (quantityOnHand <= reorderPoint * 1.5) {
    return 'warning'
  }
  return 'ok'
}

/**
 * Create a receipt transaction (adds inventory)
 */
export async function createReceiptTransaction(params: {
  companyId: string
  componentId: string
  quantity: number
  date: Date
  supplier: string
  costPerUnit?: number
  updateComponentCost: boolean
  notes?: string | null
  createdById: string
}) {
  const {
    companyId,
    componentId,
    quantity,
    date,
    supplier,
    costPerUnit,
    updateComponentCost,
    notes,
    createdById,
  } = params

  return prisma.$transaction(async (tx) => {
    // Get component for cost snapshot
    const component = await tx.component.findUnique({
      where: { id: componentId },
    })

    if (!component) {
      throw new Error('Component not found')
    }

    const lineCostPerUnit = costPerUnit ?? component.costPerUnit.toNumber()

    // Create transaction with line
    const transaction = await tx.transaction.create({
      data: {
        companyId,
        type: 'receipt',
        date,
        supplier,
        notes,
        createdById,
        lines: {
          create: {
            componentId,
            quantityChange: new Prisma.Decimal(quantity),
            costPerUnit: new Prisma.Decimal(lineCostPerUnit),
          },
        },
      },
      include: {
        lines: {
          include: {
            component: {
              select: { id: true, name: true, skuCode: true },
            },
          },
        },
        createdBy: {
          select: { id: true, name: true },
        },
      },
    })

    // Update component cost if requested
    if (updateComponentCost && costPerUnit !== undefined) {
      await tx.component.update({
        where: { id: componentId },
        data: {
          costPerUnit: new Prisma.Decimal(costPerUnit),
          updatedById: createdById,
        },
      })
    }

    return transaction
  })
}

/**
 * Create an adjustment transaction (adds or removes inventory)
 */
export async function createAdjustmentTransaction(params: {
  companyId: string
  componentId: string
  quantity: number
  date: Date
  reason: string
  notes?: string | null
  createdById: string
}) {
  const { companyId, componentId, quantity, date, reason, notes, createdById } = params

  // Get component for cost snapshot
  const component = await prisma.component.findUnique({
    where: { id: componentId },
  })

  if (!component) {
    throw new Error('Component not found')
  }

  return prisma.transaction.create({
    data: {
      companyId,
      type: 'adjustment',
      date,
      reason,
      notes,
      createdById,
      lines: {
        create: {
          componentId,
          quantityChange: new Prisma.Decimal(quantity),
          costPerUnit: component.costPerUnit,
        },
      },
    },
    include: {
      lines: {
        include: {
          component: {
            select: { id: true, name: true, skuCode: true },
          },
        },
      },
      createdBy: {
        select: { id: true, name: true },
      },
    },
  })
}

/**
 * Check if a component can be deleted (not used in active BOMs)
 */
export async function canDeleteComponent(componentId: string): Promise<boolean> {
  const activeBomLineCount = await prisma.bOMLine.count({
    where: {
      componentId,
      bomVersion: {
        isActive: true,
      },
    },
  })
  return activeBomLineCount === 0
}
