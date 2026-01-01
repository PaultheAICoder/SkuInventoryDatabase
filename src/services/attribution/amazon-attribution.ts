/**
 * Amazon Attribution Service
 *
 * Combines SP-API order data (total sales) with Ads API data (ad-attributed sales)
 * to calculate organic sales percentages per ASIN with support for different
 * attribution windows.
 */

import { prisma } from '@/lib/db'
import { format, parseISO, startOfDay, endOfDay } from 'date-fns'
import type {
  CalculateAttributionOptions,
  AttributionResponse,
  AttributionSummary,
  DailyAttribution,
  AsinAttribution,
  AttributionTrendPoint,
  RecalculateAttributionResult,
} from '@/types/attribution'

// ============================================
// Core Attribution Calculations
// ============================================

/**
 * Calculate organic sales: max(0, total - adAttributed)
 * Handles edge case where ad > total by returning 0
 */
export function calculateOrganic(totalSales: number, adAttributedSales: number): number {
  return Math.max(0, totalSales - adAttributedSales)
}

/**
 * Calculate organic percentage
 */
export function calculateOrganicPercentage(totalSales: number, organicSales: number): number {
  if (totalSales === 0) return 0
  return Math.round((organicSales / totalSales) * 10000) / 100  // 2 decimal places
}

/**
 * Calculate ad percentage
 */
export function calculateAdPercentage(totalSales: number, adAttributedSales: number): number {
  if (totalSales === 0) return 0
  return Math.round((adAttributedSales / totalSales) * 10000) / 100
}

/**
 * Check if there's an anomaly (ad sales > total sales)
 */
export function hasAttributionAnomaly(totalSales: number, adAttributedSales: number): boolean {
  return adAttributedSales > totalSales && totalSales > 0
}

// ============================================
// Date Grouping Helpers
// ============================================

function getDateKey(date: Date, groupBy: 'day' | 'week' | 'month'): string {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')

  switch (groupBy) {
    case 'day':
      return `${year}-${month}-${day}`
    case 'week': {
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

// ============================================
// Main Attribution Functions
// ============================================

/**
 * Get full attribution breakdown for a brand
 */
export async function getAttributionBreakdown(
  options: CalculateAttributionOptions
): Promise<AttributionResponse> {
  const {
    brandId,
    startDate,
    endDate,
    asin,
    attributionWindow = '7d',
    groupBy = 'day',
  } = options

  // Fetch SalesDaily records for the date range
  const salesData = await prisma.salesDaily.findMany({
    where: {
      brandId,
      date: {
        gte: startOfDay(parseISO(startDate)),
        lte: endOfDay(parseISO(endDate)),
      },
      channel: 'amazon',
      ...(asin && { asin }),
    },
    orderBy: { date: 'asc' },
  })

  // Aggregate by date and ASIN
  const dailyMap = new Map<string, DailyAttribution>()
  const asinMap = new Map<string, AsinAttribution>()

  // Summary totals
  let totalSalesSum = 0
  let adAttributedSum = 0
  let totalOrdersSum = 0
  let anomalyCount = 0

  for (const record of salesData) {
    const dateKey = getDateKey(record.date, groupBy)
    const asinKey = record.asin || 'unknown'
    const totalSales = Number(record.totalSales)
    const adAttributed = Number(record.adAttributedSales)
    const organic = calculateOrganic(totalSales, adAttributed)
    const hasAnomaly = hasAttributionAnomaly(totalSales, adAttributed)
    const unitsTotal = record.unitsTotal || 0
    const unitsAd = record.unitsAdAttributed || 0
    const unitsOrg = record.unitsOrganic || 0

    // Update summary totals
    totalSalesSum += totalSales
    adAttributedSum += adAttributed
    totalOrdersSum += unitsTotal
    if (hasAnomaly) anomalyCount++

    // Update daily aggregation
    const daily = dailyMap.get(dateKey) || {
      date: dateKey,
      totalSales: 0,
      adAttributedSales: 0,
      organicSales: 0,
      organicPercentage: 0,
      adPercentage: 0,
      orderCount: 0,
      asinBreakdown: [],
    }

    daily.totalSales += totalSales
    daily.adAttributedSales += adAttributed
    daily.organicSales += organic
    daily.orderCount += unitsTotal

    // Add to ASIN breakdown for this day
    daily.asinBreakdown.push({
      asin: asinKey,
      totalSales,
      adAttributedSales: adAttributed,
      organicSales: organic,
      organicPercentage: calculateOrganicPercentage(totalSales, organic),
      adPercentage: calculateAdPercentage(totalSales, adAttributed),
      unitsTotal,
      unitsAdAttributed: unitsAd,
      unitsOrganic: unitsOrg,
      hasAnomaly,
      anomalyNote: hasAnomaly ? 'Ad-attributed sales exceed total sales' : undefined,
    })

    dailyMap.set(dateKey, daily)

    // Update ASIN aggregation
    const asinAgg = asinMap.get(asinKey) || {
      asin: asinKey,
      totalSales: 0,
      adAttributedSales: 0,
      organicSales: 0,
      organicPercentage: 0,
      adPercentage: 0,
      unitsTotal: 0,
      unitsAdAttributed: 0,
      unitsOrganic: 0,
      hasAnomaly: false,
    }

    asinAgg.totalSales += totalSales
    asinAgg.adAttributedSales += adAttributed
    asinAgg.organicSales += organic
    asinAgg.unitsTotal += unitsTotal
    asinAgg.unitsAdAttributed += unitsAd
    asinAgg.unitsOrganic += unitsOrg
    if (hasAnomaly) asinAgg.hasAnomaly = true

    asinMap.set(asinKey, asinAgg)
  }

  // Calculate final percentages for daily records
  const dailyEntries = Array.from(dailyMap.entries())
  for (const [, daily] of dailyEntries) {
    daily.organicPercentage = calculateOrganicPercentage(daily.totalSales, daily.organicSales)
    daily.adPercentage = calculateAdPercentage(daily.totalSales, daily.adAttributedSales)
  }

  // Calculate final percentages for ASIN records
  const asinEntries = Array.from(asinMap.entries())
  for (const [, asinData] of asinEntries) {
    asinData.organicPercentage = calculateOrganicPercentage(asinData.totalSales, asinData.organicSales)
    asinData.adPercentage = calculateAdPercentage(asinData.totalSales, asinData.adAttributedSales)
  }

  // Build trends array
  const trends: AttributionTrendPoint[] = dailyEntries.map(([date, data]) => ({
    date,
    organicPercentage: data.organicPercentage,
    adPercentage: data.adPercentage,
    totalSales: data.totalSales,
  }))

  // Build summary
  const organicSum = calculateOrganic(totalSalesSum, adAttributedSum)
  const summary: AttributionSummary = {
    totalSales: totalSalesSum,
    adAttributedSales: adAttributedSum,
    organicSales: organicSum,
    organicPercentage: calculateOrganicPercentage(totalSalesSum, organicSum),
    adPercentage: calculateAdPercentage(totalSalesSum, adAttributedSum),
    totalOrders: totalOrdersSum,
    asinCount: asinMap.size,
    anomalyCount,
    attributionWindow,
  }

  return {
    summary,
    daily: dailyEntries.map(([, d]) => d).sort((a, b) => a.date.localeCompare(b.date)),
    trends: trends.sort((a, b) => a.date.localeCompare(b.date)),
    byAsin: asinEntries
      .map(([, a]) => a)
      .sort((a, b) => b.totalSales - a.totalSales),  // Sort by sales descending
    dateRange: { startDate, endDate },
    attributionWindow,
  }
}

/**
 * Recalculate organic sales for all SalesDaily records in date range
 * Called after syncing both orders and ads data
 */
export async function recalculateAttribution(options: {
  brandId: string
  startDate?: string
  endDate?: string
}): Promise<RecalculateAttributionResult> {
  const { brandId, startDate, endDate } = options
  const errors: string[] = []
  let recordsUpdated = 0
  let anomaliesDetected = 0

  // Build date filter
  const dateFilter: { gte?: Date; lte?: Date } = {}
  if (startDate) dateFilter.gte = startOfDay(parseISO(startDate))
  if (endDate) dateFilter.lte = endOfDay(parseISO(endDate))

  // Get all SalesDaily records for the brand
  const records = await prisma.salesDaily.findMany({
    where: {
      brandId,
      channel: 'amazon',
      date: Object.keys(dateFilter).length > 0 ? dateFilter : undefined,
    },
  })

  // Update each record
  for (const record of records) {
    try {
      const totalSales = Number(record.totalSales)
      const adAttributed = Number(record.adAttributedSales)
      const organic = calculateOrganic(totalSales, adAttributed)
      const hasAnomaly = hasAttributionAnomaly(totalSales, adAttributed)

      if (hasAnomaly) {
        anomaliesDetected++
        console.warn(
          `[Attribution] Anomaly detected: ASIN ${record.asin} on ${format(record.date, 'yyyy-MM-dd')}: ` +
          `ad=$${adAttributed.toFixed(2)} > total=$${totalSales.toFixed(2)}`
        )
      }

      // Calculate organic units proportionally
      const unitsProportion = totalSales > 0 ? organic / totalSales : 0
      const unitsOrganic = Math.round((record.unitsTotal || 0) * unitsProportion)

      await prisma.salesDaily.update({
        where: { id: record.id },
        data: {
          organicSales: organic,
          unitsOrganic,
        },
      })

      recordsUpdated++
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error'
      errors.push(`Record ${record.id}: ${errMsg}`)
    }
  }

  return { recordsUpdated, anomaliesDetected, errors }
}

/**
 * Get attribution data for a specific ASIN over time
 */
export async function getAsinAttributionHistory(options: {
  brandId: string
  asin: string
  startDate: string
  endDate: string
}): Promise<DailyAttribution[]> {
  const { brandId, asin, startDate, endDate } = options

  const result = await getAttributionBreakdown({
    brandId,
    startDate,
    endDate,
    asin,
    groupBy: 'day',
  })

  return result.daily
}

/**
 * Get top ASINs by organic percentage
 */
export async function getTopOrganicAsins(options: {
  brandId: string
  startDate: string
  endDate: string
  limit?: number
}): Promise<AsinAttribution[]> {
  const { brandId, startDate, endDate, limit = 10 } = options

  const result = await getAttributionBreakdown({
    brandId,
    startDate,
    endDate,
    groupBy: 'day',
  })

  return result.byAsin
    .filter(a => a.totalSales > 0)  // Exclude zero-sales ASINs
    .sort((a, b) => b.organicPercentage - a.organicPercentage)
    .slice(0, limit)
}

/**
 * Get ASINs with attribution anomalies
 */
export async function getAnomalyAsins(options: {
  brandId: string
  startDate: string
  endDate: string
}): Promise<AsinAttribution[]> {
  const { brandId, startDate, endDate } = options

  const result = await getAttributionBreakdown({
    brandId,
    startDate,
    endDate,
  })

  return result.byAsin.filter(a => a.hasAnomaly)
}
