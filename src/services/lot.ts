import { prisma } from '@/lib/db'
import type { ExpiryStatus, AffectedSkuResponse } from '@/types/lot'

/**
 * Calculate expiry status based on expiry date
 * - expired: expiryDate < today
 * - expiring_soon: expiryDate within 30 days
 * - ok: expiryDate > 30 days or null (no expiry)
 */
export function calculateExpiryStatus(expiryDate: Date | null): ExpiryStatus {
  if (!expiryDate) return 'ok'

  const now = new Date()
  now.setHours(0, 0, 0, 0) // Start of today

  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  if (expiryDate < now) return 'expired'
  if (expiryDate <= thirtyDaysFromNow) return 'expiring_soon'
  return 'ok'
}

/**
 * Get lot balance from LotBalance table
 * Returns the current balance for a lot, or 0 if no balance record exists
 */
export async function getLotBalance(lotId: string): Promise<number> {
  const balance = await prisma.lotBalance.findUnique({
    where: { lotId },
    select: { quantity: true },
  })

  return balance?.quantity.toNumber() ?? 0
}

/**
 * Get affected SKUs for a lot
 * Returns all SKUs that were built using components from this lot
 * with aggregated quantity used and transaction count
 */
export async function getAffectedSkusForLot(lotId: string): Promise<AffectedSkuResponse[]> {
  // Get all transaction lines for this lot that are part of build transactions
  const transactionLines = await prisma.transactionLine.findMany({
    where: {
      lotId,
      transaction: {
        type: 'build',
        skuId: { not: null },
      },
    },
    include: {
      transaction: {
        include: {
          sku: {
            select: {
              id: true,
              name: true,
              internalCode: true,
            },
          },
        },
      },
    },
  })

  // Aggregate by SKU
  const skuMap = new Map<
    string,
    { id: string; name: string; internalCode: string; quantityUsed: number; transactionCount: number }
  >()

  for (const line of transactionLines) {
    const sku = line.transaction.sku
    if (!sku) continue

    const existing = skuMap.get(sku.id)
    // quantityChange is negative for consumption, so we negate it
    const consumed = Math.abs(line.quantityChange.toNumber())

    if (existing) {
      existing.quantityUsed += consumed
      existing.transactionCount += 1
    } else {
      skuMap.set(sku.id, {
        id: sku.id,
        name: sku.name,
        internalCode: sku.internalCode,
        quantityUsed: consumed,
        transactionCount: 1,
      })
    }
  }

  // Convert to array and format
  return Array.from(skuMap.values()).map((sku) => ({
    id: sku.id,
    name: sku.name,
    internalCode: sku.internalCode,
    quantityUsed: sku.quantityUsed.toFixed(4),
    transactionCount: sku.transactionCount,
  }))
}
