import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { SkuInventorySummary, SkuInventoryByLocation } from '@/types/finished-goods'

/**
 * Update finished goods balance atomically within a transaction
 * Creates the balance record if it doesn't exist
 * @param tx - Prisma transaction client
 * @param skuId - The SKU ID
 * @param locationId - The location ID
 * @param quantityDelta - The amount to add (positive) or subtract (negative)
 */
export async function updateFinishedGoodsBalance(
  tx: Prisma.TransactionClient,
  skuId: string,
  locationId: string,
  quantityDelta: number
): Promise<void> {
  await tx.finishedGoodsBalance.upsert({
    where: {
      skuId_locationId: {
        skuId,
        locationId,
      },
    },
    create: {
      skuId,
      locationId,
      quantity: new Prisma.Decimal(quantityDelta),
    },
    update: {
      quantity: {
        increment: new Prisma.Decimal(quantityDelta),
      },
    },
  })
}

/**
 * Get finished goods quantity for a SKU using the FinishedGoodsBalance table
 * If locationId provided, returns quantity at that location
 * Otherwise returns global total
 * Enforces tenant isolation by verifying SKU belongs to company
 *
 * This is an O(1) lookup from the pre-computed balance table instead of O(N) aggregation.
 */
export async function getSkuQuantity(
  skuId: string,
  companyId: string,
  locationId?: string
): Promise<number> {
  // Verify SKU belongs to company
  const sku = await prisma.sKU.findFirst({
    where: { id: skuId, companyId },
    select: { id: true },
  })
  if (!sku) {
    throw new Error('SKU not found or access denied')
  }

  if (!locationId) {
    // Global total - sum all location balances for this SKU
    const result = await prisma.finishedGoodsBalance.aggregate({
      where: { skuId },
      _sum: { quantity: true },
    })
    return result._sum.quantity?.toNumber() ?? 0
  }

  // Location-specific - direct O(1) lookup
  const balance = await prisma.finishedGoodsBalance.findUnique({
    where: {
      skuId_locationId: {
        skuId,
        locationId,
      },
    },
    select: { quantity: true },
  })

  return balance?.quantity.toNumber() ?? 0
}

/**
 * Get finished goods quantities for multiple SKUs using the FinishedGoodsBalance table
 * If locationId provided, returns quantities at that location
 * Otherwise returns global totals
 * Enforces tenant isolation by filtering to only company-owned SKUs
 *
 * This is an efficient batch lookup from the pre-computed balance table.
 */
export async function getSkuQuantities(
  skuIds: string[],
  companyId: string,
  locationId?: string
): Promise<Map<string, number>> {
  // Filter to only SKUs the company owns
  if (skuIds.length === 0) {
    return new Map()
  }

  const validSkus = await prisma.sKU.findMany({
    where: { id: { in: skuIds }, companyId },
    select: { id: true },
  })
  const validIds = validSkus.map((s) => s.id)

  const quantities = new Map<string, number>()

  // Initialize all requested IDs to 0
  for (const id of skuIds) {
    quantities.set(id, 0)
  }

  if (validIds.length === 0) {
    return quantities
  }

  if (!locationId) {
    // Global totals - aggregate across all locations from balance table
    const results = await prisma.finishedGoodsBalance.groupBy({
      by: ['skuId'],
      where: { skuId: { in: validIds } },
      _sum: { quantity: true },
    })

    for (const result of results) {
      quantities.set(result.skuId, result._sum.quantity?.toNumber() ?? 0)
    }
  } else {
    // Location-specific - direct lookups from balance table
    const balances = await prisma.finishedGoodsBalance.findMany({
      where: {
        skuId: { in: validIds },
        locationId,
      },
      select: { skuId: true, quantity: true },
    })

    for (const balance of balances) {
      quantities.set(balance.skuId, balance.quantity.toNumber())
    }
  }

  return quantities
}

/**
 * Get finished goods inventory summary for a SKU (grouped by location) using FinishedGoodsBalance
 * Enforces tenant isolation by verifying SKU belongs to company
 *
 * This is an efficient lookup from the pre-computed balance table.
 */
export async function getSkuInventorySummary(
  skuId: string,
  companyId: string
): Promise<SkuInventorySummary> {
  // Verify SKU belongs to company
  const sku = await prisma.sKU.findFirst({
    where: { id: skuId, companyId },
    select: { id: true },
  })
  if (!sku) {
    throw new Error('SKU not found or access denied')
  }

  // Get all balances for this SKU with location info (filter out zero balances)
  const balances = await prisma.finishedGoodsBalance.findMany({
    where: {
      skuId,
      quantity: { not: new Prisma.Decimal(0) },
    },
    include: {
      location: {
        select: { id: true, name: true, type: true },
      },
    },
  })

  const byLocation: SkuInventoryByLocation[] = balances.map(b => ({
    locationId: b.location.id,
    locationName: b.location.name,
    locationType: b.location.type,
    quantity: b.quantity.toNumber(),
  }))

  // Sort by quantity descending
  byLocation.sort((a, b) => b.quantity - a.quantity)

  const totalQuantity = byLocation.reduce((sum, b) => sum + b.quantity, 0)

  return { totalQuantity, byLocation }
}

/**
 * Create a finished goods adjustment transaction
 */
export async function adjustFinishedGoods(params: {
  companyId: string
  skuId: string
  locationId: string
  quantity: number
  reason: string
  notes?: string | null
  date: Date
  createdById: string
}): Promise<{ id: string }> {
  const { companyId, skuId, locationId, quantity, reason, notes, date, createdById } = params

  return prisma.$transaction(async (tx) => {
    // Create adjustment transaction with finished goods line
    const transaction = await tx.transaction.create({
      data: {
        companyId,
        type: 'adjustment',
        date,
        skuId,
        reason,
        notes,
        createdById,
        finishedGoodsLines: {
          create: {
            skuId,
            locationId,
            quantityChange: new Prisma.Decimal(quantity),
            costPerUnit: null, // Adjustment doesn't have cost
          },
        },
      },
      select: { id: true },
    })

    // Update finished goods balance atomically
    await updateFinishedGoodsBalance(tx, skuId, locationId, quantity)

    return transaction
  })
}

/**
 * Create a finished goods receipt transaction (for returns, corrections)
 * Always adds to inventory (positive quantity only)
 */
export async function receiveFinishedGoods(params: {
  companyId: string
  skuId: string
  locationId: string
  quantity: number
  source: string
  costPerUnit?: number
  notes?: string | null
  date: Date
  createdById: string
}): Promise<{ id: string; newBalance: number }> {
  const { companyId, skuId, locationId, quantity, source, costPerUnit, notes, date, createdById } = params

  const result = await prisma.$transaction(async (tx) => {
    // Create receipt transaction with finished goods line
    const transaction = await tx.transaction.create({
      data: {
        companyId,
        type: 'receipt',
        date,
        skuId,
        supplier: source, // Reuse supplier field for source
        notes,
        createdById,
        locationId, // For FG receipt, location goes on transaction for reference
        finishedGoodsLines: {
          create: {
            skuId,
            locationId,
            quantityChange: new Prisma.Decimal(quantity),
            costPerUnit: costPerUnit ? new Prisma.Decimal(costPerUnit) : null,
          },
        },
      },
      select: { id: true },
    })

    // Update finished goods balance atomically
    await updateFinishedGoodsBalance(tx, skuId, locationId, quantity)

    return transaction
  })

  // Get new balance at this location (outside transaction for read-after-commit)
  const newBalance = await getSkuQuantity(skuId, companyId, locationId)

  return { id: result.id, newBalance }
}

/**
 * Create a finished goods transfer between locations
 */
export async function transferFinishedGoods(params: {
  companyId: string
  skuId: string
  fromLocationId: string
  toLocationId: string
  quantity: number
  notes?: string | null
  date: Date
  createdById: string
}): Promise<{ id: string }> {
  const { companyId, skuId, fromLocationId, toLocationId, quantity, notes, date, createdById } = params

  // Validate not same location
  if (fromLocationId === toLocationId) {
    throw new Error('Cannot transfer to the same location')
  }

  return prisma.$transaction(async (tx) => {
    // Validate locations belong to company
    const [fromLocation, toLocation] = await Promise.all([
      tx.location.findFirst({
        where: { id: fromLocationId, companyId, isActive: true },
      }),
      tx.location.findFirst({
        where: { id: toLocationId, companyId, isActive: true },
      }),
    ])

    if (!fromLocation) {
      throw new Error('Source location not found or not active')
    }
    if (!toLocation) {
      throw new Error('Destination location not found or not active')
    }

    // Check sufficient inventory at source
    const available = await getSkuQuantity(skuId, companyId, fromLocationId)
    if (available < quantity) {
      throw new Error(
        `Insufficient finished goods at source location. Available: ${available}, Required: ${quantity}`
      )
    }

    // Create transfer transaction with two finished goods lines
    const transaction = await tx.transaction.create({
      data: {
        companyId,
        type: 'transfer',
        date,
        skuId,
        notes,
        fromLocationId,
        toLocationId,
        createdById,
        finishedGoodsLines: {
          create: [
            // Deduction from source
            {
              skuId,
              locationId: fromLocationId,
              quantityChange: new Prisma.Decimal(-quantity),
              costPerUnit: null,
            },
            // Addition to destination
            {
              skuId,
              locationId: toLocationId,
              quantityChange: new Prisma.Decimal(quantity),
              costPerUnit: null,
            },
          ],
        },
      },
      select: { id: true },
    })

    // Update finished goods balances atomically
    await updateFinishedGoodsBalance(tx, skuId, fromLocationId, -quantity)
    await updateFinishedGoodsBalance(tx, skuId, toLocationId, quantity)

    return transaction
  })
}

/**
 * Create an outbound transaction (shipping SKUs out of warehouse)
 * Decrements finished goods inventory at the specified location
 */
export async function createOutboundTransaction(params: {
  companyId: string
  skuId: string
  locationId: string
  quantity: number
  salesChannel: string
  notes?: string | null
  date: Date
  createdById: string
}): Promise<{ id: string; newBalance: number }> {
  const { companyId, skuId, locationId, quantity, salesChannel, notes, date, createdById } = params

  return prisma.$transaction(async (tx) => {
    // Check sufficient inventory at location
    const currentQty = await getSkuQuantity(skuId, companyId, locationId)
    if (currentQty < quantity) {
      throw new Error(
        `Insufficient finished goods at location. Available: ${currentQty}, Required: ${quantity}`
      )
    }

    // Create outbound transaction with finished goods line
    const transaction = await tx.transaction.create({
      data: {
        companyId,
        type: 'outbound',
        date,
        skuId,
        salesChannel,
        notes,
        locationId,
        createdById,
        finishedGoodsLines: {
          create: {
            skuId,
            locationId,
            quantityChange: new Prisma.Decimal(-quantity), // Negative to decrement
            costPerUnit: null,
          },
        },
      },
      select: { id: true },
    })

    // Update finished goods balance atomically
    await updateFinishedGoodsBalance(tx, skuId, locationId, -quantity)

    // Get new balance from updated balance record
    const balance = await tx.finishedGoodsBalance.findUnique({
      where: { skuId_locationId: { skuId, locationId } },
      select: { quantity: true },
    })
    const newBalance = balance?.quantity.toNumber() ?? 0

    return { id: transaction.id, newBalance }
  })
}
