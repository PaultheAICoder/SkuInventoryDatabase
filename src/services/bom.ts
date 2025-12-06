import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { getComponentQuantities } from './inventory'

/**
 * Calculate the unit cost of a BOM version by summing component costs * quantities
 */
export async function calculateBOMUnitCost(bomVersionId: string): Promise<number> {
  const lines = await prisma.bOMLine.findMany({
    where: { bomVersionId },
    include: {
      component: {
        select: { costPerUnit: true },
      },
    },
  })

  return lines.reduce((total, line) => {
    const lineCost = line.component.costPerUnit.toNumber() * line.quantityPerUnit.toNumber()
    return total + lineCost
  }, 0)
}

/**
 * Calculate unit costs for multiple BOM versions at once
 */
export async function calculateBOMUnitCosts(
  bomVersionIds: string[]
): Promise<Map<string, number>> {
  const lines = await prisma.bOMLine.findMany({
    where: { bomVersionId: { in: bomVersionIds } },
    include: {
      component: {
        select: { costPerUnit: true },
      },
    },
  })

  const costs = new Map<string, number>()

  // Initialize all versions with 0
  for (const id of bomVersionIds) {
    costs.set(id, 0)
  }

  // Sum up costs per version
  for (const line of lines) {
    const lineCost = line.component.costPerUnit.toNumber() * line.quantityPerUnit.toNumber()
    const currentCost = costs.get(line.bomVersionId) ?? 0
    costs.set(line.bomVersionId, currentCost + lineCost)
  }

  return costs
}

/**
 * Calculate max buildable units for a SKU based on component inventory and active BOM
 * Returns the minimum of (component quantity / required per unit) across all BOM lines
 * Optionally filter by location - if locationId is omitted, uses global inventory
 */
export async function calculateMaxBuildableUnits(
  skuId: string,
  locationId?: string
): Promise<number | null> {
  // Get active BOM for this SKU
  const activeBom = await prisma.bOMVersion.findFirst({
    where: {
      skuId,
      isActive: true,
    },
    include: {
      lines: {
        include: {
          component: {
            select: { id: true },
          },
        },
      },
    },
  })

  if (!activeBom || activeBom.lines.length === 0) {
    return null
  }

  // Get component quantities (filtered by location if specified)
  const componentIds = activeBom.lines.map((line) => line.component.id)
  const quantities = await getComponentQuantities(componentIds, locationId)

  // Calculate max buildable for each line, return minimum
  let minBuildable = Infinity

  for (const line of activeBom.lines) {
    const quantityOnHand = quantities.get(line.componentId) ?? 0
    const quantityPerUnit = line.quantityPerUnit.toNumber()
    const buildable = Math.floor(quantityOnHand / quantityPerUnit)
    minBuildable = Math.min(minBuildable, buildable)
  }

  return minBuildable === Infinity ? null : minBuildable
}

/**
 * Calculate max buildable units for multiple SKUs at once
 * Optionally filter by location - if locationId is omitted, uses global inventory
 */
export async function calculateMaxBuildableUnitsForSKUs(
  skuIds: string[],
  locationId?: string
): Promise<Map<string, number | null>> {
  // Get all active BOMs for these SKUs
  const activeBoms = await prisma.bOMVersion.findMany({
    where: {
      skuId: { in: skuIds },
      isActive: true,
    },
    include: {
      lines: {
        include: {
          component: {
            select: { id: true },
          },
        },
      },
    },
  })

  // Build a map of skuId -> active BOM
  const bomBySkuId = new Map<string, typeof activeBoms[0]>()
  for (const bom of activeBoms) {
    bomBySkuId.set(bom.skuId, bom)
  }

  // Collect all component IDs needed
  const allComponentIds = new Set<string>()
  for (const bom of activeBoms) {
    for (const line of bom.lines) {
      allComponentIds.add(line.componentId)
    }
  }

  // Get all component quantities at once (filtered by location if specified)
  const quantities = await getComponentQuantities(Array.from(allComponentIds), locationId)

  // Calculate max buildable for each SKU
  const result = new Map<string, number | null>()

  for (const skuId of skuIds) {
    const bom = bomBySkuId.get(skuId)

    if (!bom || bom.lines.length === 0) {
      result.set(skuId, null)
      continue
    }

    let minBuildable = Infinity
    for (const line of bom.lines) {
      const quantityOnHand = quantities.get(line.componentId) ?? 0
      const quantityPerUnit = line.quantityPerUnit.toNumber()
      const buildable = Math.floor(quantityOnHand / quantityPerUnit)
      minBuildable = Math.min(minBuildable, buildable)
    }

    result.set(skuId, minBuildable === Infinity ? null : minBuildable)
  }

  return result
}

/**
 * Create a BOM version with lines
 */
export async function createBOMVersion(params: {
  skuId: string
  versionName: string
  effectiveStartDate: Date
  isActive: boolean
  notes?: string | null
  defectNotes?: string | null
  qualityMetadata?: Record<string, unknown>
  lines: Array<{
    componentId: string
    quantityPerUnit: number
    notes?: string | null
  }>
  createdById: string
}) {
  const { skuId, versionName, effectiveStartDate, isActive, notes, defectNotes, qualityMetadata, lines, createdById } = params

  return prisma.$transaction(async (tx) => {
    // If this version should be active, deactivate any existing active version
    if (isActive) {
      await tx.bOMVersion.updateMany({
        where: {
          skuId,
          isActive: true,
        },
        data: {
          isActive: false,
          effectiveEndDate: effectiveStartDate,
        },
      })
    }

    // Create the new BOM version with lines
    const bomVersion = await tx.bOMVersion.create({
      data: {
        skuId,
        versionName,
        effectiveStartDate,
        isActive,
        notes,
        defectNotes,
        qualityMetadata: (qualityMetadata ?? {}) as Prisma.InputJsonValue,
        createdById,
        lines: {
          create: lines.map((line) => ({
            componentId: line.componentId,
            quantityPerUnit: new Prisma.Decimal(line.quantityPerUnit),
            notes: line.notes,
          })),
        },
      },
      include: {
        lines: {
          include: {
            component: {
              select: {
                id: true,
                name: true,
                skuCode: true,
                costPerUnit: true,
                unitOfMeasure: true,
              },
            },
          },
        },
        createdBy: {
          select: { id: true, name: true },
        },
      },
    })

    return bomVersion
  })
}

/**
 * Clone a BOM version with a new name
 */
export async function cloneBOMVersion(params: {
  bomVersionId: string
  newVersionName: string
  createdById: string
}) {
  const { bomVersionId, newVersionName, createdById } = params

  // Get the source BOM version with lines
  const sourceBom = await prisma.bOMVersion.findUnique({
    where: { id: bomVersionId },
    include: {
      lines: true,
    },
  })

  if (!sourceBom) {
    throw new Error('BOM version not found')
  }

  // Create a new BOM version with copied lines (not active by default)
  const newBomVersion = await prisma.bOMVersion.create({
    data: {
      skuId: sourceBom.skuId,
      versionName: newVersionName,
      effectiveStartDate: new Date(),
      isActive: false,
      notes: `Cloned from ${sourceBom.versionName}`,
      createdById,
      lines: {
        create: sourceBom.lines.map((line) => ({
          componentId: line.componentId,
          quantityPerUnit: line.quantityPerUnit,
          notes: line.notes,
        })),
      },
    },
    include: {
      lines: {
        include: {
          component: {
            select: {
              id: true,
              name: true,
              skuCode: true,
              costPerUnit: true,
              unitOfMeasure: true,
            },
          },
        },
      },
      createdBy: {
        select: { id: true, name: true },
      },
    },
  })

  return newBomVersion
}

/**
 * Activate a BOM version (deactivates any other active version for the same SKU)
 */
export async function activateBOMVersion(bomVersionId: string) {
  return prisma.$transaction(async (tx) => {
    // Get the BOM version to activate
    const bomVersion = await tx.bOMVersion.findUnique({
      where: { id: bomVersionId },
    })

    if (!bomVersion) {
      throw new Error('BOM version not found')
    }

    // Deactivate any existing active version for this SKU
    await tx.bOMVersion.updateMany({
      where: {
        skuId: bomVersion.skuId,
        isActive: true,
        id: { not: bomVersionId },
      },
      data: {
        isActive: false,
        effectiveEndDate: new Date(),
      },
    })

    // Activate the target version
    const activated = await tx.bOMVersion.update({
      where: { id: bomVersionId },
      data: {
        isActive: true,
        effectiveEndDate: null,
      },
      include: {
        lines: {
          include: {
            component: {
              select: {
                id: true,
                name: true,
                skuCode: true,
                costPerUnit: true,
                unitOfMeasure: true,
              },
            },
          },
        },
        createdBy: {
          select: { id: true, name: true },
        },
      },
    })

    return activated
  })
}

/**
 * Update a BOM version's details and optionally its lines
 */
export async function updateBOMVersion(params: {
  bomVersionId: string
  versionName?: string
  effectiveStartDate?: Date
  notes?: string | null
  defectNotes?: string | null
  qualityMetadata?: Record<string, unknown>
  lines?: Array<{
    componentId: string
    quantityPerUnit: number
    notes?: string | null
  }>
}) {
  const { bomVersionId, lines, ...updateData } = params

  return prisma.$transaction(async (tx) => {
    // Check if BOM version exists
    const existing = await tx.bOMVersion.findUnique({
      where: { id: bomVersionId },
    })

    if (!existing) {
      throw new Error('BOM version not found')
    }

    // If lines are provided, delete existing and recreate
    if (lines && lines.length > 0) {
      await tx.bOMLine.deleteMany({
        where: { bomVersionId },
      })

      await tx.bOMLine.createMany({
        data: lines.map((line) => ({
          bomVersionId,
          componentId: line.componentId,
          quantityPerUnit: new Prisma.Decimal(line.quantityPerUnit),
          notes: line.notes,
        })),
      })
    }

    // Update BOM version metadata
    const updated = await tx.bOMVersion.update({
      where: { id: bomVersionId },
      data: {
        ...(updateData.versionName !== undefined && { versionName: updateData.versionName }),
        ...(updateData.effectiveStartDate !== undefined && { effectiveStartDate: updateData.effectiveStartDate }),
        ...(updateData.notes !== undefined && { notes: updateData.notes }),
        ...(updateData.defectNotes !== undefined && { defectNotes: updateData.defectNotes }),
        ...(updateData.qualityMetadata !== undefined && {
          qualityMetadata: updateData.qualityMetadata as Prisma.InputJsonValue
        }),
      },
      include: {
        lines: {
          include: {
            component: {
              select: {
                id: true,
                name: true,
                skuCode: true,
                costPerUnit: true,
                unitOfMeasure: true,
              },
            },
          },
        },
        createdBy: {
          select: { id: true, name: true },
        },
      },
    })

    return updated
  })
}

/**
 * Get BOM lines with calculated costs
 */
export function calculateLineCosts(
  lines: Array<{
    quantityPerUnit: Prisma.Decimal
    component: { costPerUnit: Prisma.Decimal }
  }>
): Array<{ lineCost: number }> {
  return lines.map((line) => ({
    lineCost: line.quantityPerUnit.toNumber() * line.component.costPerUnit.toNumber(),
  }))
}

/**
 * Check if a component is used in any active BOM
 */
export async function isComponentInActiveBOM(componentId: string): Promise<boolean> {
  const count = await prisma.bOMLine.count({
    where: {
      componentId,
      bomVersion: {
        isActive: true,
      },
    },
  })
  return count > 0
}
