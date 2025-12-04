import { prisma } from '@/lib/db'
import type { ExpiryStatus } from '@/types/lot'

/**
 * Check if a lot is expired based on expiry date
 * Returns true if expiryDate is in the past (before today)
 */
export function isLotExpired(expiryDate: Date | null): boolean {
  if (!expiryDate) return false

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return expiryDate < today
}

/**
 * Check if a lot is expiring soon based on expiry date and warning days
 */
export function isLotExpiringSoon(expiryDate: Date | null, warningDays: number): boolean {
  if (!expiryDate) return false

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const warningDate = new Date(today.getTime() + warningDays * 24 * 60 * 60 * 1000)

  return expiryDate <= warningDate && expiryDate >= today
}

/**
 * Calculate expiry status with configurable warning days
 */
export function calculateExpiryStatusWithConfig(
  expiryDate: Date | null,
  warningDays: number
): ExpiryStatus {
  if (!expiryDate) return 'ok'
  if (isLotExpired(expiryDate)) return 'expired'
  if (isLotExpiringSoon(expiryDate, warningDays)) return 'expiring_soon'
  return 'ok'
}

/**
 * Get lots expiring within specified days for a company
 * Returns lots with positive balance that expire within the warning period
 */
export async function getExpiringLots(
  companyId: string,
  warningDays: number
): Promise<Array<{
  id: string
  lotNumber: string
  componentId: string
  componentName: string
  componentSkuCode: string
  expiryDate: Date
  balance: number
  daysUntilExpiry: number
}>> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const warningDate = new Date(today.getTime() + warningDays * 24 * 60 * 60 * 1000)

  const lots = await prisma.lot.findMany({
    where: {
      component: {
        companyId,
      },
      expiryDate: {
        gte: today,
        lte: warningDate,
      },
      balance: {
        quantity: { gt: 0 },
      },
    },
    include: {
      component: {
        select: { id: true, name: true, skuCode: true },
      },
      balance: {
        select: { quantity: true },
      },
    },
    orderBy: {
      expiryDate: 'asc',
    },
  })

  return lots.map((lot) => ({
    id: lot.id,
    lotNumber: lot.lotNumber,
    componentId: lot.componentId,
    componentName: lot.component.name,
    componentSkuCode: lot.component.skuCode,
    expiryDate: lot.expiryDate!,
    balance: lot.balance?.quantity.toNumber() ?? 0,
    daysUntilExpiry: Math.ceil(
      (lot.expiryDate!.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)
    ),
  }))
}

/**
 * Get count of expired lots with positive balance for a company
 */
export async function getExpiredLotCount(companyId: string): Promise<number> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return prisma.lot.count({
    where: {
      component: {
        companyId,
      },
      expiryDate: {
        lt: today,
      },
      balance: {
        quantity: { gt: 0 },
      },
    },
  })
}
