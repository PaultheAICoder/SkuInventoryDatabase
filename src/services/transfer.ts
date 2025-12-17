import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { getComponentQuantity, updateInventoryBalance } from './inventory'

export interface TransferResult {
  id: string
  type: 'transfer'
  date: Date
  componentId: string
  quantity: number
  fromLocationId: string
  fromLocation: { id: string; name: string }
  toLocationId: string
  toLocation: { id: string; name: string }
  notes: string | null
  createdAt: Date
  createdBy: { id: string; name: string }
  lines: Array<{
    id: string
    component: { id: string; name: string; skuCode: string }
    quantityChange: Prisma.Decimal
    costPerUnit: Prisma.Decimal | null
  }>
}

export interface TransferValidationError {
  code: 'SAME_LOCATION' | 'LOCATION_NOT_FOUND' | 'LOCATION_NOT_ACTIVE' | 'INSUFFICIENT_INVENTORY' | 'COMPONENT_NOT_FOUND'
  message: string
  details?: {
    available?: number
    required?: number
  }
}

export async function createTransferTransaction(params: {
  companyId: string
  componentId: string
  quantity: number
  fromLocationId: string
  toLocationId: string
  date: Date
  notes?: string | null
  createdById: string
}): Promise<TransferResult> {
  const {
    companyId,
    componentId,
    quantity,
    fromLocationId,
    toLocationId,
    date,
    notes,
    createdById,
  } = params

  // Validate: cannot transfer to same location
  if (fromLocationId === toLocationId) {
    throw new Error('Cannot transfer to the same location')
  }

  return prisma.$transaction(async (tx) => {
    // 1. Validate component exists and belongs to company
    const component = await tx.component.findFirst({
      where: {
        id: componentId,
        companyId,
      },
    })

    if (!component) {
      throw new Error('Component not found')
    }

    // 2. Validate both locations belong to company and are active
    const [fromLocation, toLocation] = await Promise.all([
      tx.location.findFirst({
        where: {
          id: fromLocationId,
          companyId,
          isActive: true,
        },
      }),
      tx.location.findFirst({
        where: {
          id: toLocationId,
          companyId,
          isActive: true,
        },
      }),
    ])

    if (!fromLocation) {
      throw new Error('Source location not found or not active')
    }

    if (!toLocation) {
      throw new Error('Destination location not found or not active')
    }

    // 3. Check sufficient inventory at source location
    const availableQuantity = await getComponentQuantity(componentId, companyId, fromLocationId)
    if (availableQuantity < quantity) {
      throw new Error(
        `Insufficient inventory at source location. Available: ${availableQuantity}, Required: ${quantity}`
      )
    }

    // 4. Create single transfer transaction with two lines
    // Line 1: Negative quantity (deduction from source)
    // Line 2: Positive quantity (addition to destination)
    // The location context is tracked via fromLocationId/toLocationId on the transaction
    const transaction = await tx.transaction.create({
      data: {
        companyId,
        type: 'transfer',
        date,
        notes,
        createdById,
        fromLocationId,
        toLocationId,
        // locationId is null for transfers - we use fromLocationId/toLocationId instead
        lines: {
          create: [
            // Line 1: Negative quantity at source (deduction)
            {
              componentId,
              quantityChange: new Prisma.Decimal(-quantity),
              costPerUnit: component.costPerUnit,
            },
            // Line 2: Positive quantity at destination (addition)
            {
              componentId,
              quantityChange: new Prisma.Decimal(quantity),
              costPerUnit: component.costPerUnit,
            },
          ],
        },
      },
      include: {
        fromLocation: {
          select: { id: true, name: true },
        },
        toLocation: {
          select: { id: true, name: true },
        },
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

    // 5. Update inventory balances atomically
    await updateInventoryBalance(tx, componentId, fromLocationId, -quantity)
    await updateInventoryBalance(tx, componentId, toLocationId, quantity)

    return {
      id: transaction.id,
      type: 'transfer' as const,
      date: transaction.date,
      componentId,
      quantity,
      fromLocationId: transaction.fromLocationId!,
      fromLocation: transaction.fromLocation!,
      toLocationId: transaction.toLocationId!,
      toLocation: transaction.toLocation!,
      notes: transaction.notes,
      createdAt: transaction.createdAt,
      createdBy: transaction.createdBy,
      lines: transaction.lines,
    }
  })
}
