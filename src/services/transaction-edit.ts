import { prisma } from '@/lib/db'
import { Prisma, TransactionType } from '@prisma/client'
import { getComponentQuantity, checkInsufficientInventory } from './inventory'
import { getSkuQuantity } from './finished-goods'
import { getDefaultLocationId } from './location'
import type {
  UpdateReceiptInput,
  UpdateAdjustmentInput,
  UpdateInitialInput,
  UpdateTransferInput,
  UpdateBuildInput,
  UpdateOutboundInput,
  TransactionUpdateResult,
} from '@/types/transaction-edit'

// =============================================================================
// Core Reversal Logic
// =============================================================================

/**
 * Reverse the inventory effects of a transaction's transaction lines
 * This function reverses lot balances and deletes existing transaction lines
 */
async function reverseTransactionLines(
  tx: Prisma.TransactionClient,
  transactionId: string
): Promise<void> {
  // Get existing transaction lines
  const lines = await tx.transactionLine.findMany({
    where: { transactionId },
    include: { lot: true },
  })

  // Reverse lot balance changes for lines with lots
  for (const line of lines) {
    if (line.lotId) {
      // Decrement reverses the original change
      // If original was +50 (receipt), we decrement 50 to reverse
      // If original was -30 (build consumption), we decrement -30 (= +30) to reverse
      await tx.lotBalance.update({
        where: { lotId: line.lotId },
        data: {
          quantity: {
            decrement: line.quantityChange,
          },
        },
      })
    }
  }

  // Delete existing transaction lines (will recreate with new values)
  await tx.transactionLine.deleteMany({
    where: { transactionId },
  })
}

/**
 * Reverse finished goods effects from a transaction
 */
async function reverseFinishedGoodsLines(
  tx: Prisma.TransactionClient,
  transactionId: string
): Promise<void> {
  // Just delete them - the quantity changes are calculated from summing all lines
  await tx.finishedGoodsLine.deleteMany({
    where: { transactionId },
  })
}

// =============================================================================
// Receipt Transaction Update
// =============================================================================

export async function updateReceiptTransaction(params: {
  transactionId: string
  companyId: string
  userId: string
  input: UpdateReceiptInput
}): Promise<TransactionUpdateResult> {
  const { transactionId, companyId, userId: _userId, input } = params

  return prisma.$transaction(async (tx) => {
    // 1. Verify transaction exists and belongs to company
    const existingTransaction = await tx.transaction.findFirst({
      where: {
        id: transactionId,
        companyId,
        type: 'receipt',
        status: 'approved',
      },
      include: {
        lines: true,
      },
    })

    if (!existingTransaction) {
      throw new Error('Transaction not found or cannot be edited')
    }

    // 2. Verify component exists
    const component = await tx.component.findFirst({
      where: { id: input.componentId, companyId },
    })

    if (!component) {
      throw new Error('Component not found')
    }

    // 3. Determine location
    const locationIdToUse = input.locationId ?? existingTransaction.locationId ?? await getDefaultLocationId(companyId)

    // 4. Reverse original transaction effects
    await reverseTransactionLines(tx, transactionId)

    // 5. Handle lot creation/update if lotNumber provided
    let lotId: string | null = null
    if (input.lotNumber) {
      const expiryDateValue = input.expiryDate ? new Date(input.expiryDate) : null

      // Check if lot already exists for this component
      const existingLot = await tx.lot.findUnique({
        where: {
          componentId_lotNumber: {
            componentId: input.componentId,
            lotNumber: input.lotNumber,
          },
        },
      })

      if (existingLot) {
        // Update LotBalance
        await tx.lotBalance.upsert({
          where: { lotId: existingLot.id },
          create: {
            lotId: existingLot.id,
            quantity: new Prisma.Decimal(input.quantity),
          },
          update: {
            quantity: {
              increment: new Prisma.Decimal(input.quantity),
            },
          },
        })
        lotId = existingLot.id
      } else {
        // Create new Lot and LotBalance
        const newLot = await tx.lot.create({
          data: {
            componentId: input.componentId,
            lotNumber: input.lotNumber,
            expiryDate: expiryDateValue,
            receivedQuantity: new Prisma.Decimal(input.quantity),
            supplier: input.supplier,
            notes: input.notes ?? null,
          },
        })

        await tx.lotBalance.create({
          data: {
            lotId: newLot.id,
            quantity: new Prisma.Decimal(input.quantity),
          },
        })

        lotId = newLot.id
      }
    }

    // 6. Get cost per unit
    const lineCostPerUnit = input.costPerUnit ?? component.costPerUnit.toNumber()

    // 7. Create new transaction line
    await tx.transactionLine.create({
      data: {
        transactionId,
        componentId: input.componentId,
        quantityChange: new Prisma.Decimal(input.quantity),
        costPerUnit: new Prisma.Decimal(lineCostPerUnit),
        lotId,
      },
    })

    // 8. Update lot balance if applicable
    if (lotId) {
      await tx.lotBalance.update({
        where: { lotId },
        data: {
          quantity: {
            increment: new Prisma.Decimal(0), // Already handled above
          },
        },
      })
    }

    // 9. Update transaction header
    const updatedTransaction = await tx.transaction.update({
      where: { id: transactionId },
      data: {
        date: input.date ?? existingTransaction.date,
        supplier: input.supplier,
        notes: input.notes ?? null,
        locationId: locationIdToUse,
      },
    })

    return {
      id: updatedTransaction.id,
      type: updatedTransaction.type,
      date: updatedTransaction.date,
      updatedAt: updatedTransaction.createdAt, // Prisma doesn't have updatedAt on Transaction
    }
  })
}

// =============================================================================
// Adjustment Transaction Update
// =============================================================================

export async function updateAdjustmentTransaction(params: {
  transactionId: string
  companyId: string
  userId: string
  input: UpdateAdjustmentInput
}): Promise<TransactionUpdateResult> {
  const { transactionId, companyId, userId: _userId, input } = params

  return prisma.$transaction(async (tx) => {
    // 1. Verify transaction exists
    const existingTransaction = await tx.transaction.findFirst({
      where: {
        id: transactionId,
        companyId,
        type: 'adjustment',
        status: 'approved',
      },
    })

    if (!existingTransaction) {
      throw new Error('Transaction not found or cannot be edited')
    }

    // 2. Verify component exists
    const component = await tx.component.findFirst({
      where: { id: input.componentId, companyId },
    })

    if (!component) {
      throw new Error('Component not found')
    }

    // 3. Determine location
    const locationIdToUse = input.locationId ?? existingTransaction.locationId ?? await getDefaultLocationId(companyId)

    // 4. Reverse original transaction effects
    await reverseTransactionLines(tx, transactionId)

    // 5. Create new transaction line
    await tx.transactionLine.create({
      data: {
        transactionId,
        componentId: input.componentId,
        quantityChange: new Prisma.Decimal(input.quantity),
        costPerUnit: component.costPerUnit,
      },
    })

    // 6. Update transaction header
    const updatedTransaction = await tx.transaction.update({
      where: { id: transactionId },
      data: {
        date: input.date ?? existingTransaction.date,
        reason: input.reason,
        notes: input.notes ?? null,
        locationId: locationIdToUse,
      },
    })

    return {
      id: updatedTransaction.id,
      type: updatedTransaction.type,
      date: updatedTransaction.date,
      updatedAt: updatedTransaction.createdAt,
    }
  })
}

// =============================================================================
// Initial Transaction Update
// =============================================================================

export async function updateInitialTransaction(params: {
  transactionId: string
  companyId: string
  userId: string
  input: UpdateInitialInput
}): Promise<TransactionUpdateResult> {
  const { transactionId, companyId, userId: _userId, input } = params

  return prisma.$transaction(async (tx) => {
    // 1. Verify transaction exists
    const existingTransaction = await tx.transaction.findFirst({
      where: {
        id: transactionId,
        companyId,
        type: 'initial',
        status: 'approved',
      },
    })

    if (!existingTransaction) {
      throw new Error('Transaction not found or cannot be edited')
    }

    // 2. Verify component exists
    const component = await tx.component.findFirst({
      where: { id: input.componentId, companyId },
    })

    if (!component) {
      throw new Error('Component not found')
    }

    // 3. Determine location
    const locationIdToUse = input.locationId ?? existingTransaction.locationId ?? await getDefaultLocationId(companyId)

    // 4. Reverse original transaction effects
    await reverseTransactionLines(tx, transactionId)

    // 5. Get cost per unit
    const lineCostPerUnit = input.costPerUnit ?? component.costPerUnit.toNumber()

    // 6. Create new transaction line
    await tx.transactionLine.create({
      data: {
        transactionId,
        componentId: input.componentId,
        quantityChange: new Prisma.Decimal(input.quantity),
        costPerUnit: new Prisma.Decimal(lineCostPerUnit),
      },
    })

    // 7. Update transaction header
    const updatedTransaction = await tx.transaction.update({
      where: { id: transactionId },
      data: {
        date: input.date ?? existingTransaction.date,
        notes: input.notes ?? null,
        locationId: locationIdToUse,
      },
    })

    return {
      id: updatedTransaction.id,
      type: updatedTransaction.type,
      date: updatedTransaction.date,
      updatedAt: updatedTransaction.createdAt,
    }
  })
}

// =============================================================================
// Transfer Transaction Update
// =============================================================================

export async function updateTransferTransaction(params: {
  transactionId: string
  companyId: string
  userId: string
  input: UpdateTransferInput
}): Promise<TransactionUpdateResult> {
  const { transactionId, companyId, userId: _userId, input } = params

  // Validate: cannot transfer to same location
  if (input.fromLocationId === input.toLocationId) {
    throw new Error('Cannot transfer to the same location')
  }

  return prisma.$transaction(async (tx) => {
    // 1. Verify transaction exists
    const existingTransaction = await tx.transaction.findFirst({
      where: {
        id: transactionId,
        companyId,
        type: 'transfer',
        status: 'approved',
      },
    })

    if (!existingTransaction) {
      throw new Error('Transaction not found or cannot be edited')
    }

    // 2. Verify component exists
    const component = await tx.component.findFirst({
      where: { id: input.componentId, companyId },
    })

    if (!component) {
      throw new Error('Component not found')
    }

    // 3. Validate both locations
    const [fromLocation, toLocation] = await Promise.all([
      tx.location.findFirst({
        where: { id: input.fromLocationId, companyId, isActive: true },
      }),
      tx.location.findFirst({
        where: { id: input.toLocationId, companyId, isActive: true },
      }),
    ])

    if (!fromLocation) {
      throw new Error('Source location not found or not active')
    }
    if (!toLocation) {
      throw new Error('Destination location not found or not active')
    }

    // 4. Reverse original transaction effects
    await reverseTransactionLines(tx, transactionId)

    // 5. Check sufficient inventory at source location AFTER reversal
    const availableQuantity = await getComponentQuantity(input.componentId, companyId, input.fromLocationId)
    if (availableQuantity < input.quantity) {
      throw new Error(
        `Insufficient inventory at source location. Available: ${availableQuantity}, Required: ${input.quantity}`
      )
    }

    // 6. Create new transaction lines (negative from source, positive to destination)
    await tx.transactionLine.createMany({
      data: [
        {
          transactionId,
          componentId: input.componentId,
          quantityChange: new Prisma.Decimal(-input.quantity),
          costPerUnit: component.costPerUnit,
        },
        {
          transactionId,
          componentId: input.componentId,
          quantityChange: new Prisma.Decimal(input.quantity),
          costPerUnit: component.costPerUnit,
        },
      ],
    })

    // 7. Update transaction header
    const updatedTransaction = await tx.transaction.update({
      where: { id: transactionId },
      data: {
        date: input.date ?? existingTransaction.date,
        notes: input.notes ?? null,
        fromLocationId: input.fromLocationId,
        toLocationId: input.toLocationId,
      },
    })

    return {
      id: updatedTransaction.id,
      type: updatedTransaction.type,
      date: updatedTransaction.date,
      updatedAt: updatedTransaction.createdAt,
    }
  })
}

// =============================================================================
// Build Transaction Update
// =============================================================================

export async function updateBuildTransaction(params: {
  transactionId: string
  companyId: string
  userId: string
  input: UpdateBuildInput
}): Promise<TransactionUpdateResult> {
  const { transactionId, companyId, userId: _userId, input } = params

  return prisma.$transaction(async (tx) => {
    // 1. Verify transaction exists and get SKU/BOM info
    const existingTransaction = await tx.transaction.findFirst({
      where: {
        id: transactionId,
        companyId,
        type: 'build',
        status: 'approved',
      },
      include: {
        lines: true,
        finishedGoodsLines: true,
        bomVersion: {
          include: {
            lines: {
              include: {
                component: {
                  select: { id: true, costPerUnit: true },
                },
              },
            },
          },
        },
      },
    })

    if (!existingTransaction) {
      throw new Error('Transaction not found or cannot be edited')
    }

    if (!existingTransaction.bomVersionId || !existingTransaction.bomVersion) {
      throw new Error('Build transaction missing BOM version')
    }

    if (!existingTransaction.skuId) {
      throw new Error('Build transaction missing SKU')
    }

    // 2. Determine location
    const locationIdToUse = input.locationId ?? existingTransaction.locationId ?? await getDefaultLocationId(companyId)

    // 3. Reverse original transaction effects
    await reverseTransactionLines(tx, transactionId)
    await reverseFinishedGoodsLines(tx, transactionId)

    // 4. Check inventory (after reversal)
    if (!input.allowInsufficientInventory) {
      const insufficientItems = await checkInsufficientInventory({
        bomVersionId: existingTransaction.bomVersionId,
        companyId,
        unitsToBuild: input.unitsToBuild,
        locationId: locationIdToUse ?? undefined,
      })

      if (insufficientItems.length > 0) {
        throw new Error(
          `Insufficient inventory for ${insufficientItems.length} component(s). ` +
          `Use allowInsufficientInventory option to proceed anyway.`
        )
      }
    }

    // 5. Calculate new BOM costs
    const bomLines = existingTransaction.bomVersion.lines
    const unitBomCost = bomLines.reduce((total, line) => {
      return total + line.quantityPerUnit.toNumber() * line.component.costPerUnit.toNumber()
    }, 0)
    const totalBomCost = unitBomCost * input.unitsToBuild

    // 6. Create new consumption lines with FEFO lot consumption
    for (const bomLine of bomLines) {
      const requiredQty = bomLine.quantityPerUnit.toNumber() * input.unitsToBuild

      // Try FEFO lot selection
      const availableLots = await tx.lot.findMany({
        where: {
          componentId: bomLine.componentId,
          balance: { quantity: { gt: 0 } },
        },
        include: { balance: true },
        orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
      })

      // Sort nulls to end
      const sortedLots = availableLots.sort((a, b) => {
        if (a.expiryDate === null && b.expiryDate === null) return 0
        if (a.expiryDate === null) return 1
        if (b.expiryDate === null) return -1
        return a.expiryDate.getTime() - b.expiryDate.getTime()
      })

      if (sortedLots.length > 0) {
        // Component has lots - consume using FEFO
        let remaining = requiredQty

        for (const lot of sortedLots) {
          if (remaining <= 0) break
          const available = lot.balance?.quantity.toNumber() ?? 0
          const toConsume = Math.min(available, remaining)

          if (toConsume > 0) {
            await tx.transactionLine.create({
              data: {
                transactionId,
                componentId: bomLine.componentId,
                quantityChange: new Prisma.Decimal(-1 * toConsume),
                costPerUnit: bomLine.component.costPerUnit,
                lotId: lot.id,
              },
            })

            // Deduct from LotBalance
            await tx.lotBalance.update({
              where: { lotId: lot.id },
              data: {
                quantity: { decrement: new Prisma.Decimal(toConsume) },
              },
            })

            remaining -= toConsume
          }
        }

        // If still remaining and allowInsufficientInventory, add pooled consumption
        if (remaining > 0 && input.allowInsufficientInventory) {
          await tx.transactionLine.create({
            data: {
              transactionId,
              componentId: bomLine.componentId,
              quantityChange: new Prisma.Decimal(-1 * remaining),
              costPerUnit: bomLine.component.costPerUnit,
              lotId: null,
            },
          })
        }
      } else {
        // Component has no lots - use pooled inventory
        await tx.transactionLine.create({
          data: {
            transactionId,
            componentId: bomLine.componentId,
            quantityChange: new Prisma.Decimal(-1 * requiredQty),
            costPerUnit: bomLine.component.costPerUnit,
            lotId: null,
          },
        })
      }
    }

    // 7. Create finished goods line (same location as build)
    const outputLocationId = locationIdToUse ?? await getDefaultLocationId(companyId)
    if (outputLocationId) {
      await tx.finishedGoodsLine.create({
        data: {
          transactionId,
          skuId: existingTransaction.skuId,
          locationId: outputLocationId,
          quantityChange: new Prisma.Decimal(input.unitsToBuild),
          costPerUnit: new Prisma.Decimal(unitBomCost),
        },
      })
    }

    // 8. Update transaction header
    const updatedTransaction = await tx.transaction.update({
      where: { id: transactionId },
      data: {
        date: input.date ?? existingTransaction.date,
        notes: input.notes ?? null,
        locationId: locationIdToUse,
        salesChannel: input.salesChannel ?? existingTransaction.salesChannel,
        unitsBuild: input.unitsToBuild,
        unitBomCost: new Prisma.Decimal(unitBomCost),
        totalBomCost: new Prisma.Decimal(totalBomCost),
        defectCount: input.defectCount ?? null,
        defectNotes: input.defectNotes ?? null,
        affectedUnits: input.affectedUnits ?? null,
      },
    })

    return {
      id: updatedTransaction.id,
      type: updatedTransaction.type,
      date: updatedTransaction.date,
      updatedAt: updatedTransaction.createdAt,
    }
  })
}

// =============================================================================
// Outbound Transaction Update
// =============================================================================

export async function updateOutboundTransaction(params: {
  transactionId: string
  companyId: string
  userId: string
  input: UpdateOutboundInput
}): Promise<TransactionUpdateResult> {
  const { transactionId, companyId, userId: _userId, input } = params

  return prisma.$transaction(async (tx) => {
    // 1. Verify transaction exists
    const existingTransaction = await tx.transaction.findFirst({
      where: {
        id: transactionId,
        companyId,
        type: 'outbound',
        status: 'approved',
      },
      include: {
        finishedGoodsLines: true,
      },
    })

    if (!existingTransaction) {
      throw new Error('Transaction not found or cannot be edited')
    }

    // 2. Verify SKU exists
    const sku = await tx.sKU.findFirst({
      where: { id: input.skuId, companyId },
    })

    if (!sku) {
      throw new Error('SKU not found')
    }

    // 3. Determine location
    const locationIdToUse = input.locationId ?? existingTransaction.locationId ?? await getDefaultLocationId(companyId)

    if (!locationIdToUse) {
      throw new Error('Location is required for outbound transactions')
    }

    // 4. Reverse original finished goods lines
    await reverseFinishedGoodsLines(tx, transactionId)

    // 5. Check sufficient finished goods inventory AFTER reversal
    const availableQty = await getSkuQuantity(input.skuId, companyId, locationIdToUse)
    if (availableQty < input.quantity) {
      throw new Error(
        `Insufficient finished goods at location. Available: ${availableQty}, Required: ${input.quantity}`
      )
    }

    // 6. Create new finished goods line (negative for outbound)
    await tx.finishedGoodsLine.create({
      data: {
        transactionId,
        skuId: input.skuId,
        locationId: locationIdToUse,
        quantityChange: new Prisma.Decimal(-input.quantity),
        costPerUnit: null,
      },
    })

    // 7. Update transaction header
    const updatedTransaction = await tx.transaction.update({
      where: { id: transactionId },
      data: {
        date: input.date ?? existingTransaction.date,
        notes: input.notes ?? null,
        skuId: input.skuId,
        salesChannel: input.salesChannel,
        locationId: locationIdToUse,
      },
    })

    return {
      id: updatedTransaction.id,
      type: updatedTransaction.type,
      date: updatedTransaction.date,
      updatedAt: updatedTransaction.createdAt,
    }
  })
}

// =============================================================================
// Type-Dispatch Update Function
// =============================================================================

/**
 * Main dispatcher function that routes to the correct update function based on transaction type
 */
export async function updateTransaction(params: {
  transactionId: string
  companyId: string
  userId: string
  type: TransactionType
  input: Record<string, unknown>
}): Promise<TransactionUpdateResult> {
  const { type, transactionId, companyId, userId, input } = params

  switch (type) {
    case 'receipt':
      return updateReceiptTransaction({
        transactionId,
        companyId,
        userId,
        input: input as UpdateReceiptInput,
      })

    case 'adjustment':
      return updateAdjustmentTransaction({
        transactionId,
        companyId,
        userId,
        input: input as UpdateAdjustmentInput,
      })

    case 'initial':
      return updateInitialTransaction({
        transactionId,
        companyId,
        userId,
        input: input as UpdateInitialInput,
      })

    case 'transfer':
      return updateTransferTransaction({
        transactionId,
        companyId,
        userId,
        input: input as UpdateTransferInput,
      })

    case 'build':
      return updateBuildTransaction({
        transactionId,
        companyId,
        userId,
        input: input as UpdateBuildInput,
      })

    case 'outbound':
      return updateOutboundTransaction({
        transactionId,
        companyId,
        userId,
        input: input as UpdateOutboundInput,
      })

    default:
      throw new Error(`Unsupported transaction type: ${type}`)
  }
}
