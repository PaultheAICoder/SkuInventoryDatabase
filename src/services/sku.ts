import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { calculateBOMUnitCosts, calculateMaxBuildableUnitsForSKUs } from './bom'
import { getSkuQuantities } from './finished-goods'
import { parseFractionOrNumber } from '@/lib/utils'
import type { SKUResponse } from '@/types/sku'

/**
 * Parameters for getSkusWithCosts service function
 */
export interface GetSkusWithCostsParams {
  companyId: string
  brandId?: string // Optional brand filter
  page: number
  pageSize: number
  search?: string
  salesChannel?: string
  isActive?: boolean
  sortBy: 'name' | 'internalCode' | 'salesChannel' | 'createdAt'
  sortOrder: 'asc' | 'desc'
  locationId?: string // For filtering buildable/FG quantities
}

/**
 * Result type for getSkusWithCosts service function
 */
export interface GetSkusWithCostsResult {
  data: SKUResponse[]
  meta: {
    total: number
    page: number
    pageSize: number
  }
}

/**
 * Parameters for createSku service function
 */
export interface CreateSkuParams {
  companyId: string
  brandId: string | null // null = resolve from companyId
  userId: string
  input: {
    name: string
    internalCode: string
    salesChannel: string
    externalIds: Record<string, string>
    notes?: string | null
    bomLines?: Array<{
      componentId: string
      quantityPerUnit: string
    }>
  }
}

/**
 * Result type for createSku service function
 */
export interface CreateSkuResult {
  id: string
  name: string
  internalCode: string
  salesChannel: string
  externalIds: Record<string, string>
  notes: string | null
  isActive: boolean
  version: number
  createdAt: string
  updatedAt: string
  createdBy: { id: string; name: string }
  activeBom: {
    id: string
    versionName: string
    unitCost: string
  } | null
  maxBuildableUnits: number | null
}

/**
 * Parameters for updateSku service function
 */
export interface UpdateSkuParams {
  skuId: string
  companyId: string
  userId: string
  input: {
    name?: string
    internalCode?: string
    salesChannel?: string
    externalIds?: Record<string, string>
    notes?: string | null
    isActive?: boolean
    version?: number // Required for optimistic locking
  }
}

/**
 * Result type for updateSku service function
 */
export interface UpdateSkuResult {
  id: string
  name: string
  internalCode: string
  salesChannel: string
  externalIds: Record<string, string>
  notes: string | null
  isActive: boolean
  version: number
  createdAt: string
  updatedAt: string
  createdBy: { id: string; name: string }
}

/**
 * Custom error for version conflicts in optimistic locking
 */
export class VersionConflictError extends Error {
  constructor(_resource: string = 'Record') {
    super('VERSION_CONFLICT')
    this.name = 'VersionConflictError'
  }
}

/**
 * Get SKUs with costs, buildable units, and finished goods quantities
 *
 * This is the single source of truth for SKU listing with computed fields.
 * Used by both the API route and the dashboard page.
 *
 * Features:
 * - Filters by companyId (required) and optionally brandId
 * - Supports search across name and internalCode
 * - Filters by salesChannel and isActive
 * - Calculates BOM unit costs for active BOMs
 * - Calculates max buildable units based on component inventory
 * - Gets finished goods quantities at location (or global)
 * - Supports pagination and sorting
 */
export async function getSkusWithCosts(params: GetSkusWithCostsParams): Promise<GetSkusWithCostsResult> {
  const { companyId, brandId, page, pageSize, search, salesChannel, isActive, sortBy, sortOrder, locationId } = params

  // Build where clause - scope by companyId and optionally brandId
  const where: Prisma.SKUWhereInput = {
    companyId,
    // Only add brandId filter if a specific brand is selected
    ...(brandId && { brandId }),
    ...(isActive !== undefined && { isActive }),
    ...(salesChannel && { salesChannel }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { internalCode: { contains: search, mode: 'insensitive' } },
      ],
    }),
  }

  // Get total count
  const total = await prisma.sKU.count({ where })

  // Get SKUs with active BOM
  const skus = await prisma.sKU.findMany({
    where,
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: { [sortBy]: sortOrder },
    include: {
      createdBy: { select: { id: true, name: true } },
      bomVersions: {
        where: { isActive: true },
        take: 1,
        select: {
          id: true,
          versionName: true,
        },
      },
    },
  })

  // Note: SKU model now includes `version` field for optimistic locking

  // Get BOM costs and buildable units
  const skuIds = skus.map((s) => s.id)
  const activeBomIds = skus
    .filter((s) => s.bomVersions[0])
    .map((s) => s.bomVersions[0].id)

  const [bomCosts, buildableUnits, finishedGoodsQtys] = await Promise.all([
    activeBomIds.length > 0 ? calculateBOMUnitCosts(activeBomIds, companyId) : new Map<string, number>(),
    skuIds.length > 0 ? calculateMaxBuildableUnitsForSKUs(skuIds, companyId, locationId) : new Map<string, number | null>(),
    skuIds.length > 0 ? getSkuQuantities(skuIds, companyId, locationId) : new Map<string, number>(),
  ])

  // Transform response
  const data: SKUResponse[] = skus.map((sku) => {
    const activeBom = sku.bomVersions[0]
    const unitCost = activeBom ? bomCosts.get(activeBom.id) ?? 0 : null

    return {
      id: sku.id,
      name: sku.name,
      internalCode: sku.internalCode,
      salesChannel: sku.salesChannel,
      externalIds: sku.externalIds as Record<string, string>,
      notes: sku.notes,
      isActive: sku.isActive,
      version: sku.version,
      createdAt: sku.createdAt.toISOString(),
      updatedAt: sku.updatedAt.toISOString(),
      createdBy: sku.createdBy,
      activeBom: activeBom
        ? {
            id: activeBom.id,
            versionName: activeBom.versionName,
            unitCost: unitCost?.toFixed(4) ?? '0.0000',
          }
        : null,
      maxBuildableUnits: buildableUnits.get(sku.id) ?? null,
      finishedGoodsQuantity: finishedGoodsQtys.get(sku.id) ?? 0,
    }
  })

  return { data, meta: { total, page, pageSize } }
}

/**
 * Create a new SKU with optional inline BOM
 *
 * This is the single source of truth for SKU creation.
 * Handles:
 * - Brand validation/resolution
 * - Duplicate internalCode check
 * - SKU creation
 * - Optional BOM version creation with lines
 *
 * @throws Error if brand not found or internalCode already exists
 */
export async function createSku(params: CreateSkuParams): Promise<CreateSkuResult> {
  const { companyId, brandId: providedBrandId, userId, input } = params

  // Resolve brand ID
  let brandId = providedBrandId

  if (!brandId) {
    // Fall back to first active brand if none selected
    const brand = await prisma.brand.findFirst({
      where: { companyId, isActive: true },
    })
    if (!brand) {
      throw new Error('NO_ACTIVE_BRAND')
    }
    brandId = brand.id
  } else {
    // Validate brand belongs to selected company
    const validBrand = await prisma.brand.findFirst({
      where: {
        id: brandId,
        companyId,
        isActive: true,
      },
    })

    if (!validBrand) {
      throw new Error('INVALID_BRAND')
    }
  }

  // Check for duplicate internalCode within the company
  const existing = await prisma.sKU.findFirst({
    where: {
      companyId,
      internalCode: input.internalCode,
    },
  })

  if (existing) {
    throw new Error('DUPLICATE_INTERNAL_CODE')
  }

  // Check if BOM lines are provided
  const hasBomLines = input.bomLines && input.bomLines.length > 0

  if (hasBomLines) {
    // Create SKU and BOM version in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create SKU
      const sku = await tx.sKU.create({
        data: {
          brandId,
          companyId,
          name: input.name,
          internalCode: input.internalCode,
          salesChannel: input.salesChannel,
          externalIds: input.externalIds as Prisma.InputJsonValue,
          notes: input.notes,
          createdById: userId,
          updatedById: userId,
        },
        include: {
          createdBy: { select: { id: true, name: true } },
        },
      })

      // Create BOM version with lines
      const bomVersion = await tx.bOMVersion.create({
        data: {
          skuId: sku.id,
          versionName: 'v1',
          effectiveStartDate: new Date(),
          isActive: true,
          createdById: userId,
          lines: {
            create: input.bomLines!.map((line) => ({
              componentId: line.componentId,
              quantityPerUnit: parseFractionOrNumber(line.quantityPerUnit) ?? 1,
            })),
          },
        },
      })

      return { sku, bomVersion }
    })

    return {
      id: result.sku.id,
      name: result.sku.name,
      internalCode: result.sku.internalCode,
      salesChannel: result.sku.salesChannel,
      externalIds: result.sku.externalIds as Record<string, string>,
      notes: result.sku.notes,
      isActive: result.sku.isActive,
      version: result.sku.version,
      createdAt: result.sku.createdAt.toISOString(),
      updatedAt: result.sku.updatedAt.toISOString(),
      createdBy: result.sku.createdBy,
      activeBom: {
        id: result.bomVersion.id,
        versionName: result.bomVersion.versionName,
        unitCost: '0.0000', // Will be calculated on refresh
      },
      maxBuildableUnits: null,
    }
  }

  // No BOM lines - create SKU only
  const sku = await prisma.sKU.create({
    data: {
      brandId,
      companyId,
      name: input.name,
      internalCode: input.internalCode,
      salesChannel: input.salesChannel,
      externalIds: input.externalIds as Prisma.InputJsonValue,
      notes: input.notes,
      createdById: userId,
      updatedById: userId,
    },
    include: {
      createdBy: { select: { id: true, name: true } },
    },
  })

  return {
    id: sku.id,
    name: sku.name,
    internalCode: sku.internalCode,
    salesChannel: sku.salesChannel,
    externalIds: sku.externalIds as Record<string, string>,
    notes: sku.notes,
    isActive: sku.isActive,
    version: sku.version,
    createdAt: sku.createdAt.toISOString(),
    updatedAt: sku.updatedAt.toISOString(),
    createdBy: sku.createdBy,
    activeBom: null,
    maxBuildableUnits: null,
  }
}

/**
 * Update an existing SKU with optimistic locking
 *
 * @throws VersionConflictError if version mismatch detected
 * @throws Error with 'SKU_NOT_FOUND' if SKU doesn't exist
 * @throws Error with 'DUPLICATE_INTERNAL_CODE' if code already exists
 */
export async function updateSku(params: UpdateSkuParams): Promise<UpdateSkuResult> {
  const { skuId, companyId, userId, input } = params

  // Verify SKU exists and get current version
  const existing = await prisma.sKU.findFirst({
    where: { id: skuId, companyId },
    select: { id: true, version: true, brandId: true, internalCode: true },
  })

  if (!existing) {
    throw new Error('SKU_NOT_FOUND')
  }

  // Check version for optimistic locking
  if (input.version !== undefined && existing.version > input.version) {
    throw new VersionConflictError('SKU')
  }

  // Check for duplicate internalCode if changed
  if (input.internalCode && input.internalCode !== existing.internalCode) {
    const duplicate = await prisma.sKU.findFirst({
      where: {
        brandId: existing.brandId,
        internalCode: input.internalCode,
        id: { not: skuId },
      },
    })
    if (duplicate) {
      throw new Error('DUPLICATE_INTERNAL_CODE')
    }
  }

  // Update with version increment
  const sku = await prisma.sKU.update({
    where: { id: skuId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.internalCode !== undefined && { internalCode: input.internalCode }),
      ...(input.salesChannel !== undefined && { salesChannel: input.salesChannel }),
      ...(input.externalIds !== undefined && { externalIds: input.externalIds as Prisma.InputJsonValue }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      updatedById: userId,
      version: { increment: 1 },
    },
    include: {
      createdBy: { select: { id: true, name: true } },
    },
  })

  return {
    id: sku.id,
    name: sku.name,
    internalCode: sku.internalCode,
    salesChannel: sku.salesChannel,
    externalIds: sku.externalIds as Record<string, string>,
    notes: sku.notes,
    isActive: sku.isActive,
    version: sku.version,
    createdAt: sku.createdAt.toISOString(),
    updatedAt: sku.updatedAt.toISOString(),
    createdBy: sku.createdBy,
  }
}
