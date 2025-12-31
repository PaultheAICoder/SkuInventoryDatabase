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
import { getAvailableLotsForComponent, consumeLotsForBuildTx } from './lot-selection'
import { toLocalDateString } from '@/lib/utils'

/**
 * Update inventory balance atomically within a transaction
 * Creates the balance record if it doesn't exist
 * @param tx - Prisma transaction client
 * @param componentId - The component ID
 * @param locationId - The location ID
 * @param quantityDelta - The amount to add (positive) or subtract (negative)
 */
export async function updateInventoryBalance(
  tx: Prisma.TransactionClient,
  componentId: string,
  locationId: string,
  quantityDelta: number
): Promise<void> {
  await tx.inventoryBalance.upsert({
    where: {
      componentId_locationId: {
        componentId,
        locationId,
      },
    },
    create: {
      componentId,
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
 * Fetch and merge company settings with defaults
 * Returns validated settings or defaults if validation fails
 */
export async function getCompanySettings(companyId: string): Promise<CompanySettings> {
  // Defensive check - return defaults if no companyId provided
  if (!companyId) {
    console.warn('getCompanySettings called without companyId, returning defaults')
    return DEFAULT_SETTINGS
  }

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
 * Get the on-hand quantity for a component using the InventoryBalance table
 * Optionally filter by location - if locationId is omitted, returns global total
 *
 * This is an O(1) lookup from the pre-computed balance table instead of O(N) aggregation.
 * Balance table is updated atomically with each transaction.
 */
export async function getComponentQuantity(
  componentId: string,
  companyId: string,
  locationId?: string
): Promise<number> {
  // Verify component belongs to company
  const component = await prisma.component.findFirst({
    where: { id: componentId, companyId },
    select: { id: true }
  })
  if (!component) {
    throw new Error('Component not found or access denied')
  }

  if (!locationId) {
    // Global total - sum all location balances for this component
    const result = await prisma.inventoryBalance.aggregate({
      where: { componentId },
      _sum: { quantity: true },
    })
    return result._sum.quantity?.toNumber() ?? 0
  }

  // Location-specific - direct O(1) lookup
  const balance = await prisma.inventoryBalance.findUnique({
    where: {
      componentId_locationId: {
        componentId,
        locationId,
      },
    },
    select: { quantity: true },
  })

  return balance?.quantity.toNumber() ?? 0
}

/**
 * Get quantities for multiple components at once using the InventoryBalance table
 * Optionally filter by location - if locationId is omitted, returns global totals
 *
 * This is an efficient batch lookup from the pre-computed balance table.
 */
export async function getComponentQuantities(
  componentIds: string[],
  companyId: string,
  locationId?: string
): Promise<Map<string, number>> {
  // Filter to only components the company owns
  if (componentIds.length === 0) {
    return new Map()
  }
  const validComponents = await prisma.component.findMany({
    where: { id: { in: componentIds }, companyId },
    select: { id: true }
  })
  const validIds = validComponents.map(c => c.id)

  const quantities = new Map<string, number>()

  // Initialize all to 0 (for all originally requested IDs)
  for (const id of componentIds) {
    quantities.set(id, 0)
  }

  if (validIds.length === 0) {
    return quantities
  }

  if (!locationId) {
    // Global totals - aggregate across all locations from balance table
    const results = await prisma.inventoryBalance.groupBy({
      by: ['componentId'],
      where: { componentId: { in: validIds } },
      _sum: { quantity: true },
    })

    for (const result of results) {
      quantities.set(result.componentId, result._sum.quantity?.toNumber() ?? 0)
    }
  } else {
    // Location-specific - direct lookups from balance table
    const balances = await prisma.inventoryBalance.findMany({
      where: {
        componentId: { in: validIds },
        locationId,
      },
      select: { componentId: true, quantity: true },
    })

    for (const balance of balances) {
      quantities.set(balance.componentId, balance.quantity.toNumber())
    }
  }

  return quantities
}

/**
 * Get component quantity breakdown by all locations using the InventoryBalance table
 * Returns array of { locationId, locationName, locationType, quantity } for all locations with inventory
 */
export async function getComponentQuantitiesByLocation(
  componentId: string,
  companyId: string
): Promise<Array<{ locationId: string; locationName: string; locationType: string; quantity: number }>> {
  // Verify component belongs to company
  const component = await prisma.component.findFirst({
    where: { id: componentId, companyId },
    select: { id: true }
  })
  if (!component) {
    throw new Error('Component not found or access denied')
  }

  // Get all balances for this component with location info (filter out zero balances)
  const balances = await prisma.inventoryBalance.findMany({
    where: {
      componentId,
      quantity: { not: new Prisma.Decimal(0) },
    },
    include: {
      location: {
        select: { id: true, name: true, type: true },
      },
    },
  })

  return balances
    .map(b => ({
      locationId: b.location.id,
      locationName: b.location.name,
      locationType: b.location.type,
      quantity: b.quantity.toNumber(),
    }))
    .sort((a, b) => a.locationName.localeCompare(b.locationName))
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

    // Update inventory balance atomically
    if (locationIdToUse) {
      await updateInventoryBalance(tx, componentId, locationIdToUse, quantity)
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

  return prisma.$transaction(async (tx) => {
    // Get component for cost snapshot
    const component = await tx.component.findUnique({
      where: { id: componentId },
    })

    if (!component) {
      throw new Error('Component not found')
    }

    const transaction = await tx.transaction.create({
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

    // Update inventory balance atomically
    if (locationIdToUse) {
      await updateInventoryBalance(tx, componentId, locationIdToUse, quantity)
    }

    return transaction
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

    // Update inventory balance atomically
    if (locationIdToUse) {
      await updateInventoryBalance(tx, componentId, locationIdToUse, quantity)
    }

    return transaction
  })
}

/**
 * Check if a component can be safely deactivated
 * Returns detailed reason if deletion is blocked
 */
export async function canDeleteComponent(
  componentId: string,
  companyId: string
): Promise<{ canDelete: boolean; reason?: string }> {
  // Verify component belongs to company
  const component = await prisma.component.findFirst({
    where: { id: componentId, companyId },
    select: { id: true }
  })
  if (!component) {
    return { canDelete: false, reason: 'Component not found or access denied' }
  }

  // Check 1: Transaction history - most common blocker (scoped by company)
  const transactionLineCount = await prisma.transactionLine.count({
    where: {
      componentId,
      transaction: { companyId }
    },
  })
  if (transactionLineCount > 0) {
    return {
      canDelete: false,
      reason: `Cannot deactivate component with ${transactionLineCount} transaction record(s). Historical data must be preserved.`,
    }
  }

  // Check 2: BOM references (active AND inactive, scoped by company)
  const bomLineCount = await prisma.bOMLine.count({
    where: {
      componentId,
      bomVersion: { sku: { companyId } }
    },
  })
  if (bomLineCount > 0) {
    return {
      canDelete: false,
      reason: `Cannot deactivate component used in ${bomLineCount} BOM(s). Remove from all BOMs first.`,
    }
  }

  // Check 3: Lot references (component is already verified to belong to company)
  const lotCount = await prisma.lot.count({
    where: { componentId },
  })
  if (lotCount > 0) {
    return {
      canDelete: false,
      reason: `Cannot deactivate component with ${lotCount} lot(s). Delete lots first.`,
    }
  }

  return { canDelete: true }
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
  companyId: string
  unitsToBuild: number
  locationId?: string
}): Promise<InsufficientInventoryItem[]> {
  const { bomVersionId, companyId, unitsToBuild, locationId } = params

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
  const quantities = await getComponentQuantities(componentIds, companyId, locationId)

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
 * Uses the centralized FEFO algorithm from lot-selection service
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

    // Use centralized FEFO service for lot selection (include expired lots)
    const availableLots = await getAvailableLotsForComponent(line.componentId, { excludeExpired: false })

    let remaining = requiredQty
    for (const lot of availableLots) {
      if (remaining <= 0) break
      const toConsume = Math.min(lot.availableQuantity, remaining)

      if (toConsume > 0 && lot.isExpired) {
        expiredLots.push({
          componentId: line.componentId,
          componentName: line.component.name,
          skuCode: line.component.skuCode,
          lotId: lot.lotId,
          lotNumber: lot.lotNumber,
          expiryDate: toLocalDateString(lot.expiryDate!),
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
    companyId,
    unitsToBuild,
    locationId: locationIdToUse ?? undefined,
  })

  if (insufficientItems.length > 0 && !allowInsufficientInventory) {
    throw new Error(
      `Insufficient inventory for ${insufficientItems.length} component(s). ` +
        `Use allowInsufficientInventory option to proceed anyway.`
    )
  }

  // Determine if we should output to finished goods (defaults to true)
  const shouldOutputFG = params.outputToFinishedGoods !== false

  // Determine output location for finished goods
  // Use explicit outputLocationId if provided, otherwise use default location when outputToFinishedGoods is enabled
  const outputLocationIdToUse = params.outputLocationId ?? (shouldOutputFG ? await getDefaultLocationId(companyId) : null)

  // Validate that we have a location when outputting to finished goods
  if (shouldOutputFG && !outputLocationIdToUse) {
    throw new Error(
      'Cannot create build transaction: No output location specified and company has no default location. ' +
      'Please select an output location or set a default location in Company Settings.'
    )
  }

  // Use atomic transaction to create build transaction + finished goods line together
  const transactionResult = await prisma.$transaction(async (tx) => {
    // Get BOM lines with component costs for snapshot - INSIDE transaction for atomicity
    // This prevents race conditions where component costs could change between fetch and commit
    const bomLines = await tx.bOMLine.findMany({
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

    // Create build transaction first (without consumption lines - they will be added by consumeLotsForBuildTx)
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
      },
    })

    // Use centralized lot consumption service with FEFO algorithm
    // This creates transaction lines and updates lot balances atomically
    const consumedLots = await consumeLotsForBuildTx({
      tx,
      transactionId: transaction.id,
      bomLines: bomLines.map((line) => ({
        componentId: line.componentId,
        quantityRequired: line.quantityPerUnit.toNumber() * unitsToBuild,
        costPerUnit: line.component.costPerUnit.toNumber(),
      })),
      lotOverrides,
      allowInsufficientInventory,
    })

    // Re-fetch transaction with all includes for response
    const transactionWithIncludes = await tx.transaction.findUniqueOrThrow({
      where: { id: transaction.id },
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

    // Update inventory balances for consumed components
    // consumeLotsForBuildTx already updated lot balances, now update component inventory balances
    if (locationIdToUse) {
      for (const consumed of consumedLots) {
        await updateInventoryBalance(
          tx,
          consumed.componentId,
          locationIdToUse,
          -consumed.quantity // negative value decrements
        )
      }
    }

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

      // Update finished goods balance
      await tx.finishedGoodsBalance.upsert({
        where: {
          skuId_locationId: {
            skuId,
            locationId: outputLocationIdToUse,
          },
        },
        create: {
          skuId,
          locationId: outputLocationIdToUse,
          quantity: new Prisma.Decimal(outputQty),
        },
        update: {
          quantity: {
            increment: new Prisma.Decimal(outputQty),
          },
        },
      })
    }

    return {
      transaction: transactionWithIncludes,
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

/**
 * Result type for components with computed reorder status
 */
export interface ComponentWithReorderStatus {
  id: string
  name: string
  skuCode: string
  category: string | null
  unitOfMeasure: string
  costPerUnit: string
  reorderPoint: number
  leadTimeDays: number
  notes: string | null
  isActive: boolean
  quantityOnHand: number
  reorderStatus: 'critical' | 'warning' | 'ok'
  createdAt: string
  updatedAt: string
  createdBy: { id: string; name: string }
}

/**
 * Fetch components with computed reorderStatus at the DB level.
 * Supports filtering by status, pagination, and sorting.
 * Optionally filters quantities by location.
 *
 * This function pushes the status computation to SQL to avoid
 * loading all components when filtering by reorderStatus.
 */
export async function getComponentsWithReorderStatus(params: {
  companyId: string
  brandId?: string
  page: number
  pageSize: number
  sortBy: string
  sortOrder: 'asc' | 'desc'
  search?: string
  category?: string
  isActive?: boolean
  reorderStatus: 'critical' | 'warning' | 'ok'
  locationId?: string
  reorderWarningMultiplier: number
}): Promise<{ data: ComponentWithReorderStatus[]; total: number }> {
  const {
    companyId,
    brandId,
    page,
    pageSize,
    sortBy,
    sortOrder,
    search,
    category,
    isActive,
    reorderStatus,
    locationId,
    reorderWarningMultiplier,
  } = params

  const offset = (page - 1) * pageSize

  // Validate sortBy to prevent SQL injection (only allow known columns)
  const allowedSortColumns = ['name', 'skuCode', 'category', 'costPerUnit', 'reorderPoint', 'createdAt']
  const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'name'
  const safeSortOrder = sortOrder === 'desc' ? 'DESC' : 'ASC'

  // Map sortBy to actual column name with proper quoting
  const sortColumnMap: Record<string, string> = {
    name: 'c."name"',
    skuCode: 'c."skuCode"',
    category: 'c."category"',
    costPerUnit: 'c."costPerUnit"',
    reorderPoint: 'c."reorderPoint"',
    createdAt: 'c."createdAt"',
  }
  const orderByColumn = sortColumnMap[safeSortBy] || 'c."name"'

  // Build the quantity subquery based on whether we have a locationId filter
  // Using InventoryBalance table for O(1) lookups instead of aggregating TransactionLines
  let quantitySubquery: string

  if (locationId) {
    // Location-specific quantities from InventoryBalance table
    quantitySubquery = `
      SELECT c.id as "componentId", COALESCE(
        (
          SELECT ib.quantity
          FROM "InventoryBalance" ib
          WHERE ib."componentId" = c.id
            AND ib."locationId" = $5
        ),
        0
      ) as qty_sum
      FROM "Component" c
      WHERE c."companyId" = $1
    `
  } else {
    // Global quantities - sum all location balances from InventoryBalance table
    quantitySubquery = `
      SELECT c.id as "componentId", COALESCE(
        (
          SELECT SUM(ib.quantity)
          FROM "InventoryBalance" ib
          WHERE ib."componentId" = c.id
        ),
        0
      ) as qty_sum
      FROM "Component" c
      WHERE c."companyId" = $1
    `
  }

  // Build WHERE clause conditions dynamically
  const conditions: string[] = ['c."companyId" = $1']
  const queryParams: (string | number | boolean)[] = [companyId]
  let paramIndex = 2

  if (brandId) {
    conditions.push(`c."brandId" = $${paramIndex}`)
    queryParams.push(brandId)
    paramIndex++
  }

  if (isActive !== undefined) {
    conditions.push(`c."isActive" = $${paramIndex}`)
    queryParams.push(isActive)
    paramIndex++
  }

  if (category) {
    conditions.push(`c."category" = $${paramIndex}`)
    queryParams.push(category)
    paramIndex++
  }

  if (search) {
    conditions.push(`(c."name" ILIKE $${paramIndex} OR c."skuCode" ILIKE $${paramIndex})`)
    queryParams.push(`%${search}%`)
    paramIndex++
  }

  // Store locationId param index for quantity subquery
  const locationParamIndex = paramIndex
  if (locationId) {
    queryParams.push(locationId)
    paramIndex++
  }

  // Add reorderWarningMultiplier to params (always needed for the CASE statement in SELECT)
  const multiplierParamIndex = paramIndex
  queryParams.push(reorderWarningMultiplier)
  paramIndex++

  // Build reorderStatus condition for WHERE clause
  // Cast reorderPoint to numeric for float multiplication
  let statusCondition: string
  if (reorderStatus === 'critical') {
    statusCondition = `q.qty_sum <= c."reorderPoint" AND c."reorderPoint" > 0`
  } else if (reorderStatus === 'warning') {
    statusCondition = `q.qty_sum > c."reorderPoint" AND q.qty_sum <= c."reorderPoint"::numeric * $${multiplierParamIndex}::numeric AND c."reorderPoint" > 0`
  } else {
    // 'ok' status
    statusCondition = `c."reorderPoint" = 0 OR q.qty_sum > c."reorderPoint"::numeric * $${multiplierParamIndex}::numeric`
  }

  const whereClause = conditions.join(' AND ')

  // Adjust the quantity subquery to use the correct parameter index for locationId
  const adjustedQuantitySubquery = locationId
    ? quantitySubquery.replace(/\$5/g, `$${locationParamIndex}`)
    : quantitySubquery

  // Main query with CTE for quantities
  const dataQuery = `
    WITH quantities AS (
      ${adjustedQuantitySubquery}
    )
    SELECT
      c.id,
      c.name,
      c."skuCode",
      c.category,
      c."unitOfMeasure",
      c."costPerUnit"::text,
      c."reorderPoint",
      c."leadTimeDays",
      c.notes,
      c."isActive",
      c."createdAt",
      c."updatedAt",
      c."createdById",
      u.id as "createdById",
      u.name as "createdByName",
      COALESCE(q.qty_sum, 0)::int as "quantityOnHand",
      CASE
        WHEN c."reorderPoint" = 0 THEN 'ok'
        WHEN COALESCE(q.qty_sum, 0) <= c."reorderPoint" THEN 'critical'
        WHEN COALESCE(q.qty_sum, 0) <= c."reorderPoint"::numeric * $${multiplierParamIndex}::numeric THEN 'warning'
        ELSE 'ok'
      END as "reorderStatus"
    FROM "Component" c
    LEFT JOIN quantities q ON q."componentId" = c.id
    LEFT JOIN "User" u ON u.id = c."createdById"
    WHERE ${whereClause}
      AND (${statusCondition})
    ORDER BY ${orderByColumn} ${safeSortOrder}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `

  // Count query
  // Note: We include a dummy reference to the multiplier param to keep param count consistent
  // This ensures both queries receive the same parameters
  const countQuery = `
    WITH quantities AS (
      ${adjustedQuantitySubquery}
    )
    SELECT COUNT(*)::int as total
    FROM "Component" c
    LEFT JOIN quantities q ON q."componentId" = c.id
    WHERE ${whereClause}
      AND (${statusCondition})
      AND ($${multiplierParamIndex}::numeric IS NOT NULL OR TRUE)
  `

  // Add limit and offset params
  const dataParams = [...queryParams, pageSize, offset]
  const countParams = queryParams

  // Execute both queries in parallel
  type DataRow = {
    id: string
    name: string
    skuCode: string
    category: string | null
    unitOfMeasure: string
    costPerUnit: string
    reorderPoint: number
    leadTimeDays: number
    notes: string | null
    isActive: boolean
    createdAt: Date
    updatedAt: Date
    createdById: string
    createdByName: string
    quantityOnHand: number
    reorderStatus: 'critical' | 'warning' | 'ok'
  }

  type CountRow = {
    total: number
  }

  const [dataRows, countRows] = await Promise.all([
    prisma.$queryRawUnsafe<DataRow[]>(dataQuery, ...dataParams),
    prisma.$queryRawUnsafe<CountRow[]>(countQuery, ...countParams),
  ])

  const total = countRows[0]?.total ?? 0

  // Transform to response format
  const data: ComponentWithReorderStatus[] = dataRows.map((row) => ({
    id: row.id,
    name: row.name,
    skuCode: row.skuCode,
    category: row.category,
    unitOfMeasure: row.unitOfMeasure,
    costPerUnit: row.costPerUnit,
    reorderPoint: row.reorderPoint,
    leadTimeDays: row.leadTimeDays,
    notes: row.notes,
    isActive: row.isActive,
    quantityOnHand: row.quantityOnHand,
    reorderStatus: row.reorderStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: {
      id: row.createdById,
      name: row.createdByName,
    },
  }))

  return { data, total }
}
