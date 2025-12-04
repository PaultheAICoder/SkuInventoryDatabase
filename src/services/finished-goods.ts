import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { SkuInventorySummary, SkuInventoryByLocation } from '@/types/finished-goods'

/**
 * Get finished goods quantity for a SKU
 * If locationId provided, returns quantity at that location
 * Otherwise returns global total
 */
export async function getSkuQuantity(
  skuId: string,
  locationId?: string
): Promise<number> {
  const where: Prisma.FinishedGoodsLineWhereInput = { skuId }
  if (locationId) {
    where.locationId = locationId
  }

  const result = await prisma.finishedGoodsLine.aggregate({
    where,
    _sum: { quantityChange: true },
  })

  return result._sum.quantityChange?.toNumber() ?? 0
}

/**
 * Get finished goods quantities for multiple SKUs
 * If locationId provided, returns quantities at that location
 * Otherwise returns global totals
 */
export async function getSkuQuantities(
  skuIds: string[],
  locationId?: string
): Promise<Map<string, number>> {
  const where: Prisma.FinishedGoodsLineWhereInput = {
    skuId: { in: skuIds },
  }
  if (locationId) {
    where.locationId = locationId
  }

  const results = await prisma.finishedGoodsLine.groupBy({
    by: ['skuId'],
    where,
    _sum: { quantityChange: true },
  })

  const quantities = new Map<string, number>()

  // Initialize all to 0
  for (const id of skuIds) {
    quantities.set(id, 0)
  }

  // Set actual quantities
  for (const result of results) {
    quantities.set(result.skuId, result._sum.quantityChange?.toNumber() ?? 0)
  }

  return quantities
}

/**
 * Get finished goods inventory summary for a SKU (grouped by location)
 */
export async function getSkuInventorySummary(
  skuId: string
): Promise<SkuInventorySummary> {
  // Get quantities grouped by location
  const results = await prisma.finishedGoodsLine.groupBy({
    by: ['locationId'],
    where: { skuId },
    _sum: { quantityChange: true },
  })

  // Get location details
  const locationIds = results.map((r) => r.locationId)
  const locations = await prisma.location.findMany({
    where: { id: { in: locationIds } },
    select: { id: true, name: true, type: true },
  })

  const locationMap = new Map(locations.map((l) => [l.id, l]))

  const byLocation: SkuInventoryByLocation[] = []
  let totalQuantity = 0

  for (const result of results) {
    const qty = result._sum.quantityChange?.toNumber() ?? 0
    if (qty !== 0) {
      const loc = locationMap.get(result.locationId)
      if (loc) {
        byLocation.push({
          locationId: result.locationId,
          locationName: loc.name,
          locationType: loc.type,
          quantity: qty,
        })
        totalQuantity += qty
      }
    }
  }

  // Sort by quantity descending
  byLocation.sort((a, b) => b.quantity - a.quantity)

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

  // Create adjustment transaction with finished goods line
  const transaction = await prisma.transaction.create({
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

  return transaction
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
    const available = await getSkuQuantity(skuId, fromLocationId)
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

    return transaction
  })
}
