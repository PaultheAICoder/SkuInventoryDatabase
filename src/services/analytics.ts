import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type {
  DefectAnalyticsQuery,
  DefectAnalyticsResponse,
  DefectRateTrendPoint,
  DefectRateByBOM,
  DefectRateBySKU,
  DefectAnalyticsSummary,
} from '@/types/analytics'
import { toLocalDateString } from '@/lib/utils'

/**
 * Get defect analytics for a company
 * Aggregates build transaction data with defect information
 */
export async function getDefectAnalytics(
  companyId: string,
  query: DefectAnalyticsQuery
): Promise<DefectAnalyticsResponse> {
  const { dateFrom, dateTo, skuId, bomVersionId, salesChannel, groupBy } = query

  // Build where clause for build transactions only
  const where: Prisma.TransactionWhereInput = {
    companyId,
    type: 'build',
    unitsBuild: { gt: 0 },
    ...(dateFrom || dateTo
      ? {
          date: {
            ...(dateFrom && { gte: dateFrom }),
            ...(dateTo && { lte: dateTo }),
          },
        }
      : {}),
    ...(skuId && { skuId }),
    ...(bomVersionId && { bomVersionId }),
    ...(salesChannel && { salesChannel }),
  }

  // Get raw transaction data for aggregations
  const transactions = await prisma.transaction.findMany({
    where,
    select: {
      id: true,
      date: true,
      unitsBuild: true,
      defectCount: true,
      affectedUnits: true,
      defectNotes: true,
      salesChannel: true,
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
          effectiveStartDate: true,
        },
      },
    },
    orderBy: { date: 'asc' },
  })

  // Calculate summary
  const summary = calculateSummary(transactions)

  // Calculate trends by time period
  const trends = calculateTrends(transactions, groupBy)

  // Calculate by BOM version
  const byBOMVersion = calculateByBOMVersion(transactions)

  // Calculate by SKU
  const bySKU = calculateBySKU(transactions)

  return {
    summary,
    trends,
    byBOMVersion,
    bySKU,
    filters: {
      dateFrom: dateFrom ? toLocalDateString(dateFrom) : null,
      dateTo: dateTo ? toLocalDateString(dateTo) : null,
      skuId: skuId ?? null,
      bomVersionId: bomVersionId ?? null,
      salesChannel: salesChannel ?? null,
      groupBy,
    },
  }
}

interface TransactionData {
  id: string
  date: Date
  unitsBuild: number | null
  defectCount: number | null
  affectedUnits: number | null
  defectNotes: string | null
  salesChannel: string | null
  sku: { id: string; name: string; internalCode: string } | null
  bomVersion: { id: string; versionName: string; effectiveStartDate: Date } | null
}

function calculateSummary(transactions: TransactionData[]): DefectAnalyticsSummary {
  let totalBuilds = 0
  let totalUnitsBuilt = 0
  let totalDefects = 0
  let totalAffectedUnits = 0
  const rates: number[] = []

  for (const tx of transactions) {
    const units = tx.unitsBuild ?? 0
    const defects = tx.defectCount ?? 0
    const affected = tx.affectedUnits ?? 0

    totalBuilds++
    totalUnitsBuilt += units
    totalDefects += defects
    totalAffectedUnits += affected

    if (units > 0) {
      rates.push((defects / units) * 100)
    }
  }

  const overallDefectRate = totalUnitsBuilt > 0 ? (totalDefects / totalUnitsBuilt) * 100 : 0
  const overallAffectedRate = totalUnitsBuilt > 0 ? (totalAffectedUnits / totalUnitsBuilt) * 100 : 0
  const avgDefectRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0
  const maxDefectRate = rates.length > 0 ? Math.max(...rates) : 0
  const minDefectRate = rates.length > 0 ? Math.min(...rates) : 0

  return {
    totalBuilds,
    totalUnitsBuilt,
    totalDefects,
    totalAffectedUnits,
    overallDefectRate: Math.round(overallDefectRate * 100) / 100,
    overallAffectedRate: Math.round(overallAffectedRate * 100) / 100,
    avgDefectRate: Math.round(avgDefectRate * 100) / 100,
    maxDefectRate: Math.round(maxDefectRate * 100) / 100,
    minDefectRate: Math.round(minDefectRate * 100) / 100,
  }
}

function calculateTrends(
  transactions: TransactionData[],
  groupBy: 'day' | 'week' | 'month'
): DefectRateTrendPoint[] {
  const groups = new Map<
    string,
    { totalBuilds: number; totalUnits: number; totalDefects: number; totalAffected: number }
  >()

  for (const tx of transactions) {
    const dateKey = getDateKey(tx.date, groupBy)
    const existing = groups.get(dateKey) || {
      totalBuilds: 0,
      totalUnits: 0,
      totalDefects: 0,
      totalAffected: 0,
    }

    existing.totalBuilds++
    existing.totalUnits += tx.unitsBuild ?? 0
    existing.totalDefects += tx.defectCount ?? 0
    existing.totalAffected += tx.affectedUnits ?? 0

    groups.set(dateKey, existing)
  }

  const trends: DefectRateTrendPoint[] = []
  for (const [date, data] of Array.from(groups.entries())) {
    const defectRate = data.totalUnits > 0 ? (data.totalDefects / data.totalUnits) * 100 : 0
    const affectedRate = data.totalUnits > 0 ? (data.totalAffected / data.totalUnits) * 100 : 0

    trends.push({
      date,
      totalBuilds: data.totalBuilds,
      totalUnitsBuilt: data.totalUnits,
      totalDefects: data.totalDefects,
      totalAffectedUnits: data.totalAffected,
      defectRate: Math.round(defectRate * 100) / 100,
      affectedRate: Math.round(affectedRate * 100) / 100,
    })
  }

  return trends.sort((a, b) => a.date.localeCompare(b.date))
}

function getDateKey(date: Date, groupBy: 'day' | 'week' | 'month'): string {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')

  switch (groupBy) {
    case 'day':
      return `${year}-${month}-${day}`
    case 'week': {
      // Get Monday of the week
      const dayOfWeek = d.getDay()
      const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
      const monday = new Date(d)
      monday.setDate(diff)
      const wYear = monday.getFullYear()
      const wMonth = String(monday.getMonth() + 1).padStart(2, '0')
      const wDay = String(monday.getDate()).padStart(2, '0')
      return `${wYear}-${wMonth}-${wDay}`
    }
    case 'month':
      return `${year}-${month}-01`
  }
}

function calculateByBOMVersion(transactions: TransactionData[]): DefectRateByBOM[] {
  const groups = new Map<
    string,
    {
      bomVersionId: string
      bomVersionName: string
      skuId: string
      skuName: string
      skuCode: string
      effectiveStartDate: string
      totalBuilds: number
      totalUnits: number
      totalDefects: number
      totalAffected: number
    }
  >()

  for (const tx of transactions) {
    if (!tx.bomVersion || !tx.sku) continue

    const key = tx.bomVersion.id
    const existing = groups.get(key) || {
      bomVersionId: tx.bomVersion.id,
      bomVersionName: tx.bomVersion.versionName,
      skuId: tx.sku.id,
      skuName: tx.sku.name,
      skuCode: tx.sku.internalCode,
      effectiveStartDate: toLocalDateString(tx.bomVersion.effectiveStartDate),
      totalBuilds: 0,
      totalUnits: 0,
      totalDefects: 0,
      totalAffected: 0,
    }

    existing.totalBuilds++
    existing.totalUnits += tx.unitsBuild ?? 0
    existing.totalDefects += tx.defectCount ?? 0
    existing.totalAffected += tx.affectedUnits ?? 0

    groups.set(key, existing)
  }

  const results: DefectRateByBOM[] = []
  for (const data of Array.from(groups.values())) {
    const defectRate = data.totalUnits > 0 ? (data.totalDefects / data.totalUnits) * 100 : 0
    const affectedRate = data.totalUnits > 0 ? (data.totalAffected / data.totalUnits) * 100 : 0

    results.push({
      bomVersionId: data.bomVersionId,
      bomVersionName: data.bomVersionName,
      skuId: data.skuId,
      skuName: data.skuName,
      skuCode: data.skuCode,
      effectiveStartDate: data.effectiveStartDate,
      totalBuilds: data.totalBuilds,
      totalUnitsBuilt: data.totalUnits,
      totalDefects: data.totalDefects,
      totalAffectedUnits: data.totalAffected,
      defectRate: Math.round(defectRate * 100) / 100,
      affectedRate: Math.round(affectedRate * 100) / 100,
    })
  }

  // Sort by effective start date (newest first)
  return results.sort((a, b) => b.effectiveStartDate.localeCompare(a.effectiveStartDate))
}

function calculateBySKU(transactions: TransactionData[]): DefectRateBySKU[] {
  const groups = new Map<
    string,
    {
      skuId: string
      skuName: string
      skuCode: string
      totalBuilds: number
      totalUnits: number
      totalDefects: number
      totalAffected: number
    }
  >()

  for (const tx of transactions) {
    if (!tx.sku) continue

    const key = tx.sku.id
    const existing = groups.get(key) || {
      skuId: tx.sku.id,
      skuName: tx.sku.name,
      skuCode: tx.sku.internalCode,
      totalBuilds: 0,
      totalUnits: 0,
      totalDefects: 0,
      totalAffected: 0,
    }

    existing.totalBuilds++
    existing.totalUnits += tx.unitsBuild ?? 0
    existing.totalDefects += tx.defectCount ?? 0
    existing.totalAffected += tx.affectedUnits ?? 0

    groups.set(key, existing)
  }

  const results: DefectRateBySKU[] = []
  for (const data of Array.from(groups.values())) {
    const defectRate = data.totalUnits > 0 ? (data.totalDefects / data.totalUnits) * 100 : 0
    const affectedRate = data.totalUnits > 0 ? (data.totalAffected / data.totalUnits) * 100 : 0

    results.push({
      skuId: data.skuId,
      skuName: data.skuName,
      skuCode: data.skuCode,
      totalBuilds: data.totalBuilds,
      totalUnitsBuilt: data.totalUnits,
      totalDefects: data.totalDefects,
      totalAffectedUnits: data.totalAffected,
      defectRate: Math.round(defectRate * 100) / 100,
      affectedRate: Math.round(affectedRate * 100) / 100,
    })
  }

  // Sort by defect rate (highest first)
  return results.sort((a, b) => b.defectRate - a.defectRate)
}

/**
 * Get list of SKUs for filter dropdown (only SKUs with build transactions)
 */
export async function getSKUsWithBuilds(companyId: string): Promise<
  Array<{ id: string; name: string; internalCode: string }>
> {
  // Get user's brand first
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { brands: { where: { isActive: true }, take: 1 } },
  })

  if (!company?.brands[0]) {
    return []
  }

  const brandId = company.brands[0].id

  // Get SKUs that have build transactions
  const skus = await prisma.sKU.findMany({
    where: {
      brandId,
      isActive: true,
      transactions: {
        some: {
          type: 'build',
          companyId,
        },
      },
    },
    select: {
      id: true,
      name: true,
      internalCode: true,
    },
    orderBy: { name: 'asc' },
  })

  return skus
}

/**
 * Get list of BOM versions for filter dropdown
 */
export async function getBOMVersionsForFilter(
  companyId: string,
  skuId?: string
): Promise<Array<{ id: string; versionName: string; skuName: string }>> {
  // Get user's brand first
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { brands: { where: { isActive: true }, take: 1 } },
  })

  if (!company?.brands[0]) {
    return []
  }

  const brandId = company.brands[0].id

  const bomVersions = await prisma.bOMVersion.findMany({
    where: {
      sku: {
        brandId,
        ...(skuId && { id: skuId }),
      },
      transactions: {
        some: {
          type: 'build',
          companyId,
        },
      },
    },
    select: {
      id: true,
      versionName: true,
      sku: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return bomVersions.map((bom) => ({
    id: bom.id,
    versionName: bom.versionName,
    skuName: bom.sku.name,
  }))
}
