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
 */
export async function getComponentQuantity(
  componentId: string,
  locationId?: string
): Promise<number> {
  const whereClause: Prisma.TransactionLineWhereInput = {
    componentId,
  }

  // Add location filter via join to Transaction
  if (locationId) {
    whereClause.transaction = { locationId }
  }

  const result = await prisma.transactionLine.aggregate({
    where: whereClause,
    _sum: { quantityChange: true },
  })
  return result._sum.quantityChange?.toNumber() ?? 0
}

/**
 * Calculate quantities for multiple components at once
 * Optionally filter by location - if locationId is omitted, returns global totals
 */
export async function getComponentQuantities(
  componentIds: string[],
  locationId?: string
): Promise<Map<string, number>> {
  const whereClause: Prisma.TransactionLineWhereInput = {
    componentId: { in: componentIds },
  }

  // Add location filter via join to Transaction
  if (locationId) {
    whereClause.transaction = { locationId }
  }

  const results = await prisma.transactionLine.groupBy({
    by: ['componentId'],
    where: whereClause,
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
  }>
}

/**
 * Create a build transaction that consumes components per BOM
 * Optionally allows proceeding with insufficient inventory (with warning)
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

  // Create build transaction with consumption lines
  const transaction = await prisma.transaction.create({
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
        create: bomLines.map((line) => ({
          componentId: line.componentId,
          // Negative quantity (consuming inventory)
          quantityChange: new Prisma.Decimal(
            -1 * line.quantityPerUnit.toNumber() * unitsToBuild
          ),
          costPerUnit: line.component.costPerUnit,
        })),
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
        },
      },
      createdBy: {
        select: { id: true, name: true },
      },
    },
  })

  // Evaluate defect threshold if defects were recorded
  if (defectCount && defectCount > 0 && unitsToBuild > 0) {
    const defectRate = (defectCount / unitsToBuild) * 100
    try {
      await evaluateDefectThreshold({
        transactionId: transaction.id,
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

  return {
    transaction: transaction as unknown as BuildTransactionResult,
    insufficientItems,
    warning: insufficientItems.length > 0,
  }
}
