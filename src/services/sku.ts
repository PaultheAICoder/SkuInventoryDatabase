import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { calculateBOMUnitCosts, calculateMaxBuildableUnitsForSKUs } from './bom'
import { getSkuQuantities } from './finished-goods'
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
