import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { isLotExpired } from './expiry'

/**
 * Lot selection result for consumption
 */
export interface LotSelection {
  lotId: string
  lotNumber: string
  quantity: number
  expiryDate: Date | null
}

/**
 * Result of lot availability check
 */
export interface LotAvailabilityResult {
  componentId: string
  componentName: string
  requiredQuantity: number
  availableQuantity: number
  hasLots: boolean
  selectedLots: LotSelection[]
  isPooled: boolean // true if component has no lots (lot-less inventory)
  isSufficient: boolean
}

/**
 * Options for lot selection
 */
export interface LotSelectionOptions {
  excludeExpired?: boolean // Default: false (backward compatible)
  allowExpiredOverride?: boolean // Allow selecting expired lots with explicit override
}

/**
 * Sort lots using FEFO algorithm (earliest expiry first, nulls last)
 * This is the canonical implementation used throughout the codebase
 */
function sortLotsByFEFO<T extends { expiryDate: Date | null }>(lots: T[]): T[] {
  return [...lots].sort((a, b) => {
    if (a.expiryDate === null && b.expiryDate === null) return 0
    if (a.expiryDate === null) return 1 // nulls to end
    if (b.expiryDate === null) return -1
    return a.expiryDate.getTime() - b.expiryDate.getTime()
  })
}

/**
 * Get available lots for a component ordered by FEFO (earliest expiry first)
 * Lots without expiry dates are sorted to the end
 */
export async function getAvailableLotsForComponent(
  componentId: string,
  options?: LotSelectionOptions
): Promise<Array<{
  lotId: string
  lotNumber: string
  availableQuantity: number
  expiryDate: Date | null
  isExpired: boolean
}>> {
  const { excludeExpired = false } = options ?? {}

  // Query Lot joined with LotBalance, only lots with positive balance
  const lots = await prisma.lot.findMany({
    where: {
      componentId,
      balance: {
        quantity: { gt: 0 },
      },
    },
    include: {
      balance: true,
    },
    orderBy: [
      { expiryDate: 'asc' }, // FEFO: earliest expiry first
      { createdAt: 'asc' }, // Tie-breaker: oldest lot first
    ],
  })

  // Sort nulls to end using FEFO helper (Prisma puts nulls first by default in asc)
  const sortedLots = sortLotsByFEFO(lots)

  // Map and optionally filter expired lots
  const result = sortedLots.map((lot) => ({
    lotId: lot.id,
    lotNumber: lot.lotNumber,
    availableQuantity: lot.balance?.quantity.toNumber() ?? 0,
    expiryDate: lot.expiryDate,
    isExpired: isLotExpired(lot.expiryDate),
  }))

  if (excludeExpired) {
    return result.filter((lot) => !lot.isExpired)
  }

  return result
}

/**
 * Transaction-aware version of getAvailableLotsForComponent
 * Use within prisma.$transaction() for atomic operations
 * Ensures FEFO selection is consistent within the transaction
 */
export async function getAvailableLotsForComponentTx(
  tx: Prisma.TransactionClient,
  componentId: string,
  options?: LotSelectionOptions
): Promise<Array<{
  lotId: string
  lotNumber: string
  availableQuantity: number
  expiryDate: Date | null
  isExpired: boolean
}>> {
  const { excludeExpired = false } = options ?? {}

  // Query Lot joined with LotBalance within the transaction for consistency
  const lots = await tx.lot.findMany({
    where: {
      componentId,
      balance: {
        quantity: { gt: 0 },
      },
    },
    include: {
      balance: true,
    },
    orderBy: [
      { expiryDate: 'asc' }, // FEFO: earliest expiry first
      { createdAt: 'asc' }, // Tie-breaker: oldest lot first
    ],
  })

  // Sort nulls to end using FEFO helper (Prisma puts nulls first by default in asc)
  const sortedLots = sortLotsByFEFO(lots)

  // Map and optionally filter expired lots
  const result = sortedLots.map((lot) => ({
    lotId: lot.id,
    lotNumber: lot.lotNumber,
    availableQuantity: lot.balance?.quantity.toNumber() ?? 0,
    expiryDate: lot.expiryDate,
    isExpired: isLotExpired(lot.expiryDate),
  }))

  if (excludeExpired) {
    return result.filter((lot) => !lot.isExpired)
  }

  return result
}

/**
 * Select lots for consumption using FEFO algorithm
 * Returns array of {lotId, lotNumber, quantity, expiryDate} allocations
 * Throws if insufficient quantity across all lots
 */
export async function selectLotsForConsumption(params: {
  componentId: string
  requiredQuantity: number
  allowInsufficient?: boolean
  options?: LotSelectionOptions
}): Promise<LotSelection[]> {
  const { componentId, requiredQuantity, allowInsufficient = false, options } = params

  const availableLots = await getAvailableLotsForComponent(componentId, options)

  const selections: LotSelection[] = []
  let remaining = requiredQuantity

  for (const lot of availableLots) {
    if (remaining <= 0) break

    const toConsume = Math.min(lot.availableQuantity, remaining)
    if (toConsume > 0) {
      selections.push({
        lotId: lot.lotId,
        lotNumber: lot.lotNumber,
        quantity: toConsume,
        expiryDate: lot.expiryDate,
      })
      remaining -= toConsume
    }
  }

  if (remaining > 0 && !allowInsufficient) {
    throw new Error(
      `Insufficient lot quantity for component ${componentId}. ` +
        `Required: ${requiredQuantity}, Available across lots: ${requiredQuantity - remaining}`
    )
  }

  return selections
}

/**
 * Check lot availability for multiple components (used in build pre-check)
 * Returns detailed availability info per component, including pooled (lot-less) components
 */
export async function checkLotAvailabilityForBuild(params: {
  bomLines: Array<{
    componentId: string
    componentName: string
    skuCode: string
    quantityRequired: number
  }>
  options?: LotSelectionOptions
}): Promise<LotAvailabilityResult[]> {
  const { bomLines, options } = params
  const results: LotAvailabilityResult[] = []

  for (const line of bomLines) {
    const availableLots = await getAvailableLotsForComponent(line.componentId, options)
    const totalLotQuantity = availableLots.reduce((sum, lot) => sum + lot.availableQuantity, 0)
    const hasLots = availableLots.length > 0

    if (hasLots) {
      // Component has lots - select using FEFO
      const selectedLots: LotSelection[] = []
      let remaining = line.quantityRequired

      for (const lot of availableLots) {
        if (remaining <= 0) break
        const toConsume = Math.min(lot.availableQuantity, remaining)
        if (toConsume > 0) {
          selectedLots.push({
            lotId: lot.lotId,
            lotNumber: lot.lotNumber,
            quantity: toConsume,
            expiryDate: lot.expiryDate,
          })
          remaining -= toConsume
        }
      }

      results.push({
        componentId: line.componentId,
        componentName: line.componentName,
        requiredQuantity: line.quantityRequired,
        availableQuantity: totalLotQuantity,
        hasLots: true,
        selectedLots,
        isPooled: false,
        isSufficient: totalLotQuantity >= line.quantityRequired,
      })
    } else {
      // Component has no lots - it's pooled inventory (lot-less)
      results.push({
        componentId: line.componentId,
        componentName: line.componentName,
        requiredQuantity: line.quantityRequired,
        availableQuantity: 0, // Will be filled by caller from pooled inventory check
        hasLots: false,
        selectedLots: [],
        isPooled: true,
        isSufficient: true, // Will be validated by existing insufficient inventory check
      })
    }
  }

  return results
}

/**
 * Validate manual lot overrides
 * Ensures all specified lots exist, belong to the component, have sufficient quantity,
 * and that both the component and lot belong to the specified company (tenant isolation)
 */
export async function validateLotOverrides(
  overrides: Array<{
    componentId: string
    allocations: Array<{ lotId: string; quantity: number }>
  }>,
  companyId: string
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = []

  for (const override of overrides) {
    // First validate the component belongs to the company
    const component = await prisma.component.findFirst({
      where: {
        id: override.componentId,
        companyId,
      },
      select: { id: true },
    })
    if (!component) {
      errors.push(`Component ${override.componentId} not found or access denied`)
      continue // Skip all allocations for invalid component
    }

    for (const alloc of override.allocations) {
      // Query lot with company validation via component relation
      const lot = await prisma.lot.findFirst({
        where: {
          id: alloc.lotId,
          component: { companyId },
        },
        include: { balance: true },
      })

      if (!lot) {
        errors.push(`Lot ${alloc.lotId} not found or access denied`)
        continue
      }

      if (lot.componentId !== override.componentId) {
        errors.push(`Lot ${lot.lotNumber} does not belong to the specified component`)
        continue
      }

      const available = lot.balance?.quantity.toNumber() ?? 0
      if (available < alloc.quantity) {
        errors.push(`Lot ${lot.lotNumber}: requested ${alloc.quantity}, available ${available}`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Result of consuming a lot during a build
 */
export interface ConsumedLot {
  componentId: string
  lotId: string | null
  lotNumber: string | null
  quantity: number
  costPerUnit: number
}

/**
 * Transaction-aware lot consumption for build operations
 * Creates TransactionLines and updates LotBalance atomically within the provided transaction
 * Uses FEFO algorithm for automatic lot selection, supports manual overrides and pooled fallback
 */
export async function consumeLotsForBuildTx(params: {
  tx: Prisma.TransactionClient
  transactionId: string
  bomLines: Array<{
    componentId: string
    quantityRequired: number
    costPerUnit: number
  }>
  lotOverrides?: Array<{
    componentId: string
    allocations: Array<{ lotId: string; quantity: number }>
  }>
  allowInsufficientInventory?: boolean
}): Promise<ConsumedLot[]> {
  const { tx, transactionId, bomLines, lotOverrides, allowInsufficientInventory = false } = params
  const consumedLots: ConsumedLot[] = []

  for (const bomLine of bomLines) {
    const { componentId, quantityRequired, costPerUnit } = bomLine

    // Check if this component has a manual override
    const override = lotOverrides?.find((o) => o.componentId === componentId)

    if (override) {
      // Use manual lot allocations
      for (const alloc of override.allocations) {
        // Create transaction line for manual override
        await tx.transactionLine.create({
          data: {
            transactionId,
            componentId,
            quantityChange: new Prisma.Decimal(-1 * alloc.quantity),
            costPerUnit: new Prisma.Decimal(costPerUnit),
            lotId: alloc.lotId,
          },
        })

        // Deduct from LotBalance atomically
        await tx.lotBalance.update({
          where: { lotId: alloc.lotId },
          data: {
            quantity: { decrement: new Prisma.Decimal(alloc.quantity) },
          },
        })

        // Get lot number for response
        const lot = await tx.lot.findUnique({
          where: { id: alloc.lotId },
          select: { lotNumber: true },
        })

        consumedLots.push({
          componentId,
          lotId: alloc.lotId,
          lotNumber: lot?.lotNumber ?? null,
          quantity: alloc.quantity,
          costPerUnit,
        })
      }
    } else {
      // Use FEFO lot selection with transaction-aware query
      const availableLots = await getAvailableLotsForComponentTx(tx, componentId)

      if (availableLots.length > 0) {
        // Component has lots - consume using FEFO
        let remaining = quantityRequired

        for (const lot of availableLots) {
          if (remaining <= 0) break
          const toConsume = Math.min(lot.availableQuantity, remaining)

          if (toConsume > 0) {
            // Create transaction line
            await tx.transactionLine.create({
              data: {
                transactionId,
                componentId,
                quantityChange: new Prisma.Decimal(-1 * toConsume),
                costPerUnit: new Prisma.Decimal(costPerUnit),
                lotId: lot.lotId,
              },
            })

            // Deduct from LotBalance atomically
            await tx.lotBalance.update({
              where: { lotId: lot.lotId },
              data: {
                quantity: { decrement: new Prisma.Decimal(toConsume) },
              },
            })

            consumedLots.push({
              componentId,
              lotId: lot.lotId,
              lotNumber: lot.lotNumber,
              quantity: toConsume,
              costPerUnit,
            })

            remaining -= toConsume
          }
        }

        // If still remaining and allowInsufficientInventory, add pooled consumption
        if (remaining > 0 && allowInsufficientInventory) {
          await tx.transactionLine.create({
            data: {
              transactionId,
              componentId,
              quantityChange: new Prisma.Decimal(-1 * remaining),
              costPerUnit: new Prisma.Decimal(costPerUnit),
              lotId: null,
            },
          })

          consumedLots.push({
            componentId,
            lotId: null,
            lotNumber: null,
            quantity: remaining,
            costPerUnit,
          })
        }
      } else {
        // Component has no lots - use pooled inventory (existing behavior)
        await tx.transactionLine.create({
          data: {
            transactionId,
            componentId,
            quantityChange: new Prisma.Decimal(-1 * quantityRequired),
            costPerUnit: new Prisma.Decimal(costPerUnit),
            lotId: null,
          },
        })

        consumedLots.push({
          componentId,
          lotId: null,
          lotNumber: null,
          quantity: quantityRequired,
          costPerUnit,
        })
      }
    }
  }

  return consumedLots
}
