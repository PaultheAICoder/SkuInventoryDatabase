import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { ReorderStatus } from '@/types'
import {
  companySettingsSchema,
  DEFAULT_SETTINGS,
  type CompanySettings,
} from '@/types/settings'
import { evaluateDefectThreshold } from './alert'
import { getDefaultLocationId } from './location'
import { isLotExpired } from './expiry'

/**
 * Fetch and merge company settings with defaults
 * Returns validated settings or defaults if validation fails
 */
export async function getCompanySettings(companyId: string): Promise<CompanySettings> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { settings: true },
  })

  const storedSettings = (company?.settings as Record<string, unknown>) || {}
  const merged = { ...DEFAULT_SETTINGS, ...storedSettings }
  const validated = companySettingsSchema.safeParse(merged)

  return validated.success ? validated.data : DEFAULT_SETTINGS
}

/**
 * Calculate the on-hand quantity for a component by summing all transaction lines
 * Optionally filter by location - if locationId is omitted, returns global total
 *
 * For transfers, special handling is needed:
 * - Non-transfer transactions: use transaction.locationId
 * - Transfer transactions:
 *   - negative line = outgoing from fromLocationId
 *   - positive line = incoming to toLocationId
 */
export async function getComponentQuantity(
  componentId: string,
  locationId?: string
): Promise<number> {
  if (!locationId) {
    // Global total - sum all lines for this component (only approved transactions)
    const result = await prisma.transactionLine.aggregate({
      where: {
        componentId,
        transaction: { status: 'approved' }, // Exclude drafts and rejected
      },
      _sum: { quantityChange: true },
    })
    return result._sum.quantityChange?.toNumber() ?? 0
  }

  // Location-specific total requires handling transfers specially
  // For non-transfer transactions: use transaction.locationId
  // For transfer transactions:
  //   - negative line = fromLocationId
  //   - positive line = toLocationId

  // Get regular (non-transfer) transaction lines at this location
  const regularResult = await prisma.transactionLine.aggregate({
    where: {
      componentId,
      transaction: {
        locationId,
        type: { not: 'transfer' },
        status: 'approved', // Exclude drafts and rejected
      },
    },
    _sum: { quantityChange: true },
  })

  // Get transfer lines where this is the FROM location (negative = outgoing)
  const transferFromResult = await prisma.transactionLine.aggregate({
    where: {
      componentId,
      quantityChange: { lt: 0 },
      transaction: {
        type: 'transfer',
        fromLocationId: locationId,
        status: 'approved', // Exclude drafts and rejected
      },
    },
    _sum: { quantityChange: true },
  })

  // Get transfer lines where this is the TO location (positive = incoming)
  const transferToResult = await prisma.transactionLine.aggregate({
    where: {
      componentId,
      quantityChange: { gt: 0 },
      transaction: {
        type: 'transfer',
        toLocationId: locationId,
        status: 'approved', // Exclude drafts and rejected
      },
    },
    _sum: { quantityChange: true },
  })

  const regular = regularResult._sum.quantityChange?.toNumber() ?? 0
  const transferFrom = transferFromResult._sum.quantityChange?.toNumber() ?? 0
  const transferTo = transferToResult._sum.quantityChange?.toNumber() ?? 0

  return regular + transferFrom + transferTo
}

/**
 * Calculate quantities for multiple components at once
 * Optionally filter by location - if locationId is omitted, returns global totals
 *
 * For transfers, special handling is needed:
 * - Non-transfer transactions: use transaction.locationId
 * - Transfer transactions:
 *   - negative line = outgoing from fromLocationId
 *   - positive line = incoming to toLocationId
 */
export async function getComponentQuantities(
  componentIds: string[],
  locationId?: string
): Promise<Map<string, number>> {
  if (!locationId) {
    // Global totals - no location filtering needed (only approved transactions)
    const results = await prisma.transactionLine.groupBy({
      by: ['componentId'],
      where: {
        componentId: { in: componentIds },
        transaction: { status: 'approved' }, // Exclude drafts and rejected
      },
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

  // Location-specific totals require handling transfers specially
  const quantities = new Map<string, number>()

  // Initialize all to 0
  for (const id of componentIds) {
    quantities.set(id, 0)
  }

  // Get regular (non-transfer) transaction lines at this location
  const regularResults = await prisma.transactionLine.groupBy({
    by: ['componentId'],
    where: {
      componentId: { in: componentIds },
      transaction: {
        locationId,
        type: { not: 'transfer' },
        status: 'approved', // Exclude drafts and rejected
      },
    },
    _sum: { quantityChange: true },
  })

  for (const result of regularResults) {
    const current = quantities.get(result.componentId) ?? 0
    quantities.set(result.componentId, current + (result._sum.quantityChange?.toNumber() ?? 0))
  }

  // Get transfer lines where this is the FROM location (negative = outgoing)
  const transferFromResults = await prisma.transactionLine.groupBy({
    by: ['componentId'],
    where: {
      componentId: { in: componentIds },
      quantityChange: { lt: 0 },
      transaction: {
        type: 'transfer',
        fromLocationId: locationId,
        status: 'approved', // Exclude drafts and rejected
      },
    },
    _sum: { quantityChange: true },
  })

  for (const result of transferFromResults) {
    const current = quantities.get(result.componentId) ?? 0
    quantities.set(result.componentId, current + (result._sum.quantityChange?.toNumber() ?? 0))
  }

  // Get transfer lines where this is the TO location (positive = incoming)
  const transferToResults = await prisma.transactionLine.groupBy({
    by: ['componentId'],
    where: {
      componentId: { in: componentIds },
      quantityChange: { gt: 0 },
      transaction: {
        type: 'transfer',
        toLocationId: locationId,
        status: 'approved', // Exclude drafts and rejected
      },
    },
    _sum: { quantityChange: true },
  })

  for (const result of transferToResults) {
    const current = quantities.get(result.componentId) ?? 0
    quantities.set(result.componentId, current + (result._sum.quantityChange?.toNumber() ?? 0))
  }

  return quantities
}

/**
 * Get component quantity breakdown by all locations
 * Returns array of { locationId, locationName, locationType, quantity } for all locations with inventory
 */
export async function getComponentQuantitiesByLocation(
  componentId: string,
  companyId: string
): Promise<Array<{ locationId: string; locationName: string; locationType: string; quantity: number }>> {
  // Get all active locations for the company
  const locations = await prisma.location.findMany({
    where: {
      companyId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      type: true,
    },
  })

  // Calculate quantity for each location
  const result: Array<{ locationId: string; locationName: string; locationType: string; quantity: number }> = []

  for (const location of locations) {
    const quantity = await getComponentQuantity(componentId, location.id)
    if (quantity !== 0) {
      result.push({
        locationId: location.id,
        locationName: location.name,
        locationType: location.type,
        quantity,
      })
    }
  }

  // Sort by location name
  result.sort((a, b) => a.locationName.localeCompare(b.locationName))

  return result
}

/**
 * Calculate reorder status based on quantity and reorder point
 * Critical: quantity <= reorderPoint
 * Warning: quantity <= reorderPoint * reorderWarningMultiplier
 * OK: quantity > reorderPoint * reorderWarningMultiplier
 */
export function calculateReorderStatus(
  quantityOnHand: number,
  reorderPoint: number,
  reorderWarningMultiplier: number = 1.5
): ReorderStatus {
  if (reorderPoint === 0) {
    return 'ok'
  }
  if (quantityOnHand <= reorderPoint) {
    return 'critical'
  }
  if (quantityOnHand <= reorderPoint * reorderWarningMultiplier) {
    return 'warning'
  }
  return 'ok'
}

/**
 * Create a receipt transaction (adds inventory)
 * Optionally creates or updates a Lot and LotBalance when lotNumber is provided
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
  locationId?: string
  lotNumber?: string
  expiryDate?: string
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
    locationId,
    lotNumber,
    expiryDate,
  } = params

  const locationIdToUse = locationId ?? await getDefaultLocationId(companyId)

  return prisma.$transaction(async (tx) => {
    // Get component for cost snapshot
    const component = await tx.component.findUnique({
      where: { id: componentId },
    })

    if (!component) {
      throw new Error('Component not found')
    }

    const lineCostPerUnit = costPerUnit ?? component.costPerUnit.toNumber()

    // Handle lot creation/update if lotNumber provided
    let lotId: string | null = null
    if (lotNumber) {
      // Parse expiry date if provided
      const expiryDateValue = expiryDate ? new Date(expiryDate) : null

      // Check if lot already exists for this component
      const existingLot = await tx.lot.findUnique({
        where: {
          componentId_lotNumber: {
            componentId,
            lotNumber,
          },
        },
      })

      if (existingLot) {
        // Lot exists - update receivedQuantity
        await tx.lot.update({
          where: { id: existingLot.id },
          data: {
            receivedQuantity: {
              increment: new Prisma.Decimal(quantity),
            },
          },
        })

        // Update or create LotBalance
        await tx.lotBalance.upsert({
          where: { lotId: existingLot.id },
          create: {
            lotId: existingLot.id,
            quantity: new Prisma.Decimal(quantity),
          },
          update: {
            quantity: {
              increment: new Prisma.Decimal(quantity),
            },
          },
        })

        lotId = existingLot.id
      } else {
        // Create new Lot and LotBalance
        const newLot = await tx.lot.create({
          data: {
            componentId,
            lotNumber,
            expiryDate: expiryDateValue,
            receivedQuantity: new Prisma.Decimal(quantity),
            supplier,
            notes,
          },
        })

        await tx.lotBalance.create({
          data: {
            lotId: newLot.id,
            quantity: new Prisma.Decimal(quantity),
          },
        })

        lotId = newLot.id
      }
    }

    // Create transaction with line
    const transaction = await tx.transaction.create({
      data: {
        companyId,
        type: 'receipt',
        date,
        supplier,
        notes,
        createdById,
        locationId: locationIdToUse,
        lines: {
          create: {
            componentId,
            quantityChange: new Prisma.Decimal(quantity),
            costPerUnit: new Prisma.Decimal(lineCostPerUnit),
            lotId,
          },
        },
      },
      include: {
        lines: {
          include: {
            component: {
              select: { id: true, name: true, skuCode: true },
            },
            lot: {
              select: { id: true, lotNumber: true, expiryDate: true },
            },
          },
        },
        createdBy: {
          select: { id: true, name: true },
        },
        location: {
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
  locationId?: string
}) {
  const { companyId, componentId, quantity, date, reason, notes, createdById, locationId } = params

  const locationIdToUse = locationId ?? await getDefaultLocationId(companyId)

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
      locationId: locationIdToUse,
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
      location: {
        select: { id: true, name: true },
      },
    },
  })
}

/**
 * Create an initial transaction (sets opening balance for a component)
 */
export async function createInitialTransaction(params: {
  companyId: string
  componentId: string
  quantity: number
  date: Date
  costPerUnit?: number
  updateComponentCost: boolean
  notes?: string | null
  createdById: string
  locationId?: string
}) {
  const {
    companyId,
    componentId,
    quantity,
    date,
    costPerUnit,
    updateComponentCost,
    notes,
    createdById,
    locationId,
  } = params

  const locationIdToUse = locationId ?? await getDefaultLocationId(companyId)

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
        type: 'initial',
        date,
        notes,
        createdById,
        locationId: locationIdToUse,
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
        location: {
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

/**
 * Result type for insufficient inventory check
 */
export interface InsufficientInventoryItem {
  componentId: string
  componentName: string
  skuCode: string
  required: number
  available: number
  shortage: number
}

/**
 * Result type for expired lot check
 */
export interface ExpiredLotItem {
  componentId: string
  componentName: string
  skuCode: string
  lotId: string
  lotNumber: string
  expiryDate: string
  quantity: number
}

/**
 * Check if there's sufficient inventory to build a SKU
 * Returns list of components with insufficient inventory, or empty array if sufficient
 * Optionally filter by location - if locationId is omitted, checks global inventory
 */
export async function checkInsufficientInventory(params: {
  bomVersionId: string
  unitsToBuild: number
  locationId?: string
}): Promise<InsufficientInventoryItem[]> {
  const { bomVersionId, unitsToBuild, locationId } = params

  // Get BOM lines with components
  const bomLines = await prisma.bOMLine.findMany({
    where: { bomVersionId },
    include: {
      component: {
        select: {
          id: true,
          name: true,
          skuCode: true,
        },
      },
    },
  })

  if (bomLines.length === 0) {
    return []
  }

  // Get component quantities (filtered by location if specified)
  const componentIds = bomLines.map((line) => line.componentId)
  const quantities = await getComponentQuantities(componentIds, locationId)

  const insufficientItems: InsufficientInventoryItem[] = []

  for (const line of bomLines) {
    const available = quantities.get(line.componentId) ?? 0
    const required = line.quantityPerUnit.toNumber() * unitsToBuild

    if (available < required) {
      insufficientItems.push({
        componentId: line.component.id,
        componentName: line.component.name,
        skuCode: line.component.skuCode,
        required,
        available,
        shortage: required - available,
      })
    }
  }

  return insufficientItems
}

/**
 * Check if build would use expired lots
 * Returns list of expired lots that would be consumed, or empty array if none
 */
export async function checkExpiredLotsForBuild(params: {
  bomVersionId: string
  unitsToBuild: number
}): Promise<ExpiredLotItem[]> {
  const { bomVersionId, unitsToBuild } = params

  // Get BOM lines with components
  const bomLines = await prisma.bOMLine.findMany({
    where: { bomVersionId },
    include: {
      component: {
        select: {
          id: true,
          name: true,
          skuCode: true,
        },
      },
    },
  })

  const expiredLots: ExpiredLotItem[] = []

  for (const line of bomLines) {
    const requiredQty = line.quantityPerUnit.toNumber() * unitsToBuild

    // Get lots for this component using FEFO (including expired)
    const lots = await prisma.lot.findMany({
      where: {
        componentId: line.componentId,
        balance: { quantity: { gt: 0 } },
      },
      include: { balance: true },
      orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
    })

    // Sort nulls to end
    const sortedLots = lots.sort((a, b) => {
      if (a.expiryDate === null && b.expiryDate === null) return 0
      if (a.expiryDate === null) return 1
      if (b.expiryDate === null) return -1
      return a.expiryDate.getTime() - b.expiryDate.getTime()
    })

    let remaining = requiredQty
    for (const lot of sortedLots) {
      if (remaining <= 0) break
      const available = lot.balance?.quantity.toNumber() ?? 0
      const toConsume = Math.min(available, remaining)

      if (toConsume > 0 && isLotExpired(lot.expiryDate)) {
        expiredLots.push({
          componentId: line.componentId,
          componentName: line.component.name,
          skuCode: line.component.skuCode,
          lotId: lot.id,
          lotNumber: lot.lotNumber,
          expiryDate: lot.expiryDate!.toISOString().split('T')[0],
          quantity: toConsume,
        })
      }
      remaining -= toConsume
    }
  }

  return expiredLots
}

/**
 * Build transaction result type
 */
export interface BuildTransactionResult {
  id: string
  type: 'build'
  date: Date
  sku: { id: string; name: string; internalCode: string } | null
  bomVersion: { id: string; versionName: string } | null
  locationId: string | null
  location: { id: string; name: string } | null
  salesChannel: string | null
  unitsBuild: number | null
  unitBomCost: { toString(): string } | null
  totalBomCost: { toString(): string } | null
  notes: string | null
  defectCount: number | null
  defectNotes: string | null
  affectedUnits: number | null
  createdAt: Date
  createdBy: { id: string; name: string }
  lines: Array<{
    id: string
    component: { id: string; name: string; skuCode: string }
    quantityChange: { toString(): string }
    costPerUnit: { toString(): string } | null
    lotId: string | null
    lot: { id: string; lotNumber: string; expiryDate: Date | null } | null
  }>
  outputToFinishedGoods?: boolean
  outputLocationId?: string | null
  outputLocation?: { id: string; name: string } | null
  outputQuantity?: number | null
}

/**
 * Create a build transaction that consumes components per BOM
 * Optionally allows proceeding with insufficient inventory (with warning)
 * Supports lot consumption with FEFO (First Expiry First Out) algorithm
 * and optional manual lot overrides per component
 */
export async function createBuildTransaction(params: {
  companyId: string
  skuId: string
  bomVersionId: string
  unitsToBuild: number
  salesChannel?: string
  date: Date
  notes?: string | null
  defectCount?: number | null
  defectNotes?: string | null
  affectedUnits?: number | null
  createdById: string
  allowInsufficientInventory?: boolean
  locationId?: string
  outputToFinishedGoods?: boolean
  outputLocationId?: string
  outputQuantity?: number
  lotOverrides?: Array<{
    componentId: string
    allocations: Array<{ lotId: string; quantity: number }>
  }>
  allowExpiredLots?: boolean // Allow consuming expired lots (override enforcement)
}): Promise<{
  transaction: BuildTransactionResult
  insufficientItems: InsufficientInventoryItem[]
  warning: boolean
}> {
  const {
    companyId,
    skuId,
    bomVersionId,
    unitsToBuild,
    salesChannel,
    date,
    notes,
    defectCount,
    defectNotes,
    affectedUnits,
    createdById,
    allowInsufficientInventory = false,
    locationId,
    lotOverrides,
  } = params

  const locationIdToUse = locationId ?? await getDefaultLocationId(companyId)

  // Check for insufficient inventory (at the target location if specified)
  const insufficientItems = await checkInsufficientInventory({
    bomVersionId,
    unitsToBuild,
    locationId: locationIdToUse ?? undefined,
  })

  if (insufficientItems.length > 0 && !allowInsufficientInventory) {
    throw new Error(
      `Insufficient inventory for ${insufficientItems.length} component(s). ` +
        `Use allowInsufficientInventory option to proceed anyway.`
    )
  }

  // Get BOM lines with component costs for snapshot
  const bomLines = await prisma.bOMLine.findMany({
    where: { bomVersionId },
    include: {
      component: {
        select: {
          id: true,
          costPerUnit: true,
        },
      },
    },
  })

  // Calculate unit BOM cost (snapshot at time of build)
  const unitBomCost = bomLines.reduce((total, line) => {
    return total + line.quantityPerUnit.toNumber() * line.component.costPerUnit.toNumber()
  }, 0)

  const totalBomCost = unitBomCost * unitsToBuild

  // Determine if we should output to finished goods (defaults to true)
  const shouldOutputFG = params.outputToFinishedGoods !== false

  // Determine output location for finished goods
  // Use explicit outputLocationId if provided, otherwise use default location when outputToFinishedGoods is enabled
  const outputLocationIdToUse = params.outputLocationId ?? (shouldOutputFG ? await getDefaultLocationId(companyId) : null)

  // Use atomic transaction to create build transaction + finished goods line together
  const transactionResult = await prisma.$transaction(async (tx) => {
    // Validate output location if we're outputting FG
    let outputLocation: { id: string; name: string } | null = null
    if (shouldOutputFG && outputLocationIdToUse) {
      const outputLoc = await tx.location.findFirst({
        where: {
          id: outputLocationIdToUse,
          companyId: companyId,
          isActive: true,
        },
        select: { id: true, name: true },
      })

      if (!outputLoc) {
        throw new Error('Output location not found or not active')
      }
      outputLocation = outputLoc
    }

    // Build consumption lines with lot-aware consumption (FEFO algorithm)
    const consumptionLines: Prisma.TransactionLineCreateManyTransactionInput[] = []

    for (const bomLine of bomLines) {
      const requiredQty = bomLine.quantityPerUnit.toNumber() * unitsToBuild

      // Check if this component has a manual override
      const override = lotOverrides?.find((o) => o.componentId === bomLine.componentId)

      if (override) {
        // Use manual lot allocations
        for (const alloc of override.allocations) {
          consumptionLines.push({
            componentId: bomLine.componentId,
            quantityChange: new Prisma.Decimal(-1 * alloc.quantity),
            costPerUnit: bomLine.component.costPerUnit,
            lotId: alloc.lotId,
          })

          // Deduct from LotBalance atomically
          await tx.lotBalance.update({
            where: { lotId: alloc.lotId },
            data: {
              quantity: { decrement: new Prisma.Decimal(alloc.quantity) },
            },
          })
        }
      } else {
        // Try FEFO lot selection - query lots within transaction for consistency
        const availableLots = await tx.lot.findMany({
          where: {
            componentId: bomLine.componentId,
            balance: { quantity: { gt: 0 } },
          },
          include: { balance: true },
          orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
        })

        // Sort nulls to end (Prisma puts nulls first by default in asc)
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
              consumptionLines.push({
                componentId: bomLine.componentId,
                quantityChange: new Prisma.Decimal(-1 * toConsume),
                costPerUnit: bomLine.component.costPerUnit,
                lotId: lot.id,
              })

              // Deduct from LotBalance atomically
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
          if (remaining > 0 && allowInsufficientInventory) {
            consumptionLines.push({
              componentId: bomLine.componentId,
              quantityChange: new Prisma.Decimal(-1 * remaining),
              costPerUnit: bomLine.component.costPerUnit,
              lotId: null,
            })
          }
        } else {
          // Component has no lots - use pooled inventory (existing behavior)
          consumptionLines.push({
            componentId: bomLine.componentId,
            quantityChange: new Prisma.Decimal(-1 * requiredQty),
            costPerUnit: bomLine.component.costPerUnit,
            lotId: null,
          })
        }
      }
    }

    // Create build transaction with all consumption lines
    const transaction = await tx.transaction.create({
      data: {
        companyId,
        type: 'build',
        date,
        skuId,
        bomVersionId,
        locationId: locationIdToUse,
        salesChannel,
        unitsBuild: unitsToBuild,
        unitBomCost: new Prisma.Decimal(unitBomCost),
        totalBomCost: new Prisma.Decimal(totalBomCost),
        notes,
        defectCount,
        defectNotes,
        affectedUnits,
        createdById,
        lines: {
          createMany: {
            data: consumptionLines,
          },
        },
      },
      include: {
        sku: {
          select: {
            id: true,
            name: true,
            internalCode: true,
          },
        },
        bomVersion: {
          select: {
            id: true,
            versionName: true,
          },
        },
        location: {
          select: {
            id: true,
            name: true,
          },
        },
        lines: {
          include: {
            component: {
              select: {
                id: true,
                name: true,
                skuCode: true,
              },
            },
            lot: {
              select: {
                id: true,
                lotNumber: true,
                expiryDate: true,
              },
            },
          },
        },
        createdBy: {
          select: { id: true, name: true },
        },
      },
    })

    // Create finished goods line atomically if outputting FG
    let outputQuantityActual: number | null = null
    if (shouldOutputFG && outputLocationIdToUse) {
      const outputQty = params.outputQuantity ?? unitsToBuild
      outputQuantityActual = outputQty

      await tx.finishedGoodsLine.create({
        data: {
          transactionId: transaction.id,
          skuId,
          locationId: outputLocationIdToUse,
          quantityChange: new Prisma.Decimal(outputQty),
          costPerUnit: new Prisma.Decimal(unitBomCost),
        },
      })
    }

    return {
      transaction,
      outputLocation,
      outputQuantityActual,
      outputLocationId: outputLocationIdToUse,
    }
  })

  // Evaluate defect threshold AFTER the transaction completes (non-critical, external operation)
  if (defectCount && defectCount > 0 && unitsToBuild > 0) {
    const defectRate = (defectCount / unitsToBuild) * 100
    try {
      await evaluateDefectThreshold({
        transactionId: transactionResult.transaction.id,
        skuId,
        defectRate,
        companyId,
        unitsBuild: unitsToBuild,
        defectCount,
      })
    } catch (error) {
      // Log but don't fail the build transaction
      console.error('Error evaluating defect threshold:', error)
    }
  }

  // Construct the result with output info
  const result: BuildTransactionResult = {
    ...(transactionResult.transaction as unknown as BuildTransactionResult),
    outputToFinishedGoods: shouldOutputFG,
    outputLocationId: transactionResult.outputLocationId ?? null,
    outputLocation: transactionResult.outputLocation,
    outputQuantity: transactionResult.outputQuantityActual,
  }

  return {
    transaction: result,
    insufficientItems,
    warning: insufficientItems.length > 0,
  }
}
