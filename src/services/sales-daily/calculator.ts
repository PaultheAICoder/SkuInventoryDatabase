/**
 * Sales Daily Calculator Service
 *
 * Calculates and stores daily sales with organic/ad attribution breakdown.
 * Organic sales = max(0, totalSales - adAttributedSales)
 */

import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { format, parseISO, startOfDay, endOfDay } from 'date-fns'

interface DailySalesRecord {
  brandId: string
  asin?: string
  date: Date
  totalSales: number
  adAttributedSales: number
  organicSales: number
  channel: string
  unitsTotal?: number
  unitsAdAttributed?: number
  unitsOrganic?: number
}

interface CalculateDailySalesOptions {
  brandId: string
  startDate?: string
  endDate?: string
  channel?: 'amazon' | 'shopify'
}

interface SalesDailySummary {
  date: string
  totalSales: number
  adAttributedSales: number
  organicSales: number
  organicPercentage: number
  orderCount: number
}

/**
 * Calculate organic sales: max(0, total - adAttributed)
 */
export function calculateOrganicSales(totalSales: number, adAttributedSales: number): number {
  return Math.max(0, totalSales - adAttributedSales)
}

/**
 * Calculate organic percentage
 */
export function calculateOrganicPercentage(totalSales: number, organicSales: number): number {
  if (totalSales === 0) return 0
  return (organicSales / totalSales) * 100
}

/**
 * Calculate daily sales for a brand from ad metrics
 *
 * Aggregates KeywordMetric data by date and ASIN, calculates organic attribution
 */
export async function calculateDailySalesFromAds(options: CalculateDailySalesOptions): Promise<number> {
  const { brandId, startDate, endDate, channel = 'amazon' } = options

  // Build date filter
  const dateFilter: { gte?: Date; lte?: Date } = {}
  if (startDate) dateFilter.gte = startOfDay(parseISO(startDate))
  if (endDate) dateFilter.lte = endOfDay(parseISO(endDate))

  // Get ad metrics grouped by date and ASIN
  // Filter through portfolio -> credential -> brand
  const adMetrics = await prisma.keywordMetric.findMany({
    where: {
      date: Object.keys(dateFilter).length > 0 ? dateFilter : undefined,
      portfolio: {
        credential: {
          brandId,
        },
      },
    },
    select: {
      date: true,
      sales: true,
      orders: true,
      impressions: true,
      clicks: true,
      portfolioId: true,
    },
  })

  // Aggregate by date
  const dailyTotals = new Map<string, {
    totalSales: number
    orders: number
    impressions: number
    clicks: number
  }>()

  for (const metric of adMetrics) {

    const dateKey = format(metric.date, 'yyyy-MM-dd')
    const current = dailyTotals.get(dateKey) || {
      totalSales: 0,
      orders: 0,
      impressions: 0,
      clicks: 0,
    }

    dailyTotals.set(dateKey, {
      totalSales: current.totalSales + Number(metric.sales),
      orders: current.orders + Number(metric.orders),
      impressions: current.impressions + Number(metric.impressions),
      clicks: current.clicks + Number(metric.clicks),
    })
  }

  // Upsert SalesDaily records
  let updated = 0
  const entries = Array.from(dailyTotals.entries())

  for (const [dateKey, data] of entries) {
    const date = parseISO(dateKey)

    // For Amazon Ads, adAttributed = total (all sales from ads are ad-attributed)
    // Organic comes from other channels like Shopify
    const adAttributedSales = data.totalSales
    const organicSales = 0 // No organic sales from ads data alone

    // Find existing record
    const existing = await prisma.salesDaily.findFirst({
      where: {
        brandId,
        date,
        channel,
      },
    })

    if (existing) {
      await prisma.salesDaily.update({
        where: { id: existing.id },
        data: {
          adAttributedSales,
          // Don't overwrite totalSales if it came from Shopify
          // Only update if we're the primary source
          ...(channel === 'amazon' && {
            totalSales: adAttributedSales,
            organicSales: 0,
          }),
          unitsAdAttributed: data.orders,
        },
      })
    } else {
      await prisma.salesDaily.create({
        data: {
          brandId,
          date,
          channel,
          totalSales: adAttributedSales,
          adAttributedSales,
          organicSales,
          unitsTotal: data.orders,
          unitsAdAttributed: data.orders,
          unitsOrganic: 0,
        },
      })
    }

    updated++
  }

  return updated
}

/**
 * Recalculate organic sales for existing SalesDaily records
 *
 * This should be called after syncing from both Amazon and Shopify
 * to properly calculate organic = total - adAttributed
 */
export async function recalculateOrganicSales(options: {
  brandId: string
  startDate?: string
  endDate?: string
}): Promise<number> {
  const { brandId, startDate, endDate } = options

  // Build date filter
  const dateFilter: { gte?: Date; lte?: Date } = {}
  if (startDate) dateFilter.gte = startOfDay(parseISO(startDate))
  if (endDate) dateFilter.lte = endOfDay(parseISO(endDate))

  // Get all SalesDaily records for the brand
  const records = await prisma.salesDaily.findMany({
    where: {
      brandId,
      date: Object.keys(dateFilter).length > 0 ? dateFilter : undefined,
    },
  })

  // Group by date to combine channels
  const byDate = new Map<string, typeof records>()
  for (const record of records) {
    const dateKey = format(record.date, 'yyyy-MM-dd')
    const existing = byDate.get(dateKey) || []
    existing.push(record)
    byDate.set(dateKey, existing)
  }

  let updated = 0

  // For each date, calculate organic across all channels
  const entries = Array.from(byDate.entries())
  for (const [_dateKey, dateRecords] of entries) {
    // Sum totals across channels
    let totalAllChannels = 0
    let adAttributedAllChannels = 0

    for (const rec of dateRecords) {
      totalAllChannels += Number(rec.totalSales)
      adAttributedAllChannels += Number(rec.adAttributedSales)
    }

    const organicAllChannels = calculateOrganicSales(totalAllChannels, adAttributedAllChannels)

    // Check for anomaly (ad sales > total sales)
    if (adAttributedAllChannels > totalAllChannels && totalAllChannels > 0) {
      console.warn(
        `[Calculator] Attribution anomaly on ${_dateKey}: ` +
        `ad=$${adAttributedAllChannels.toFixed(2)} > total=$${totalAllChannels.toFixed(2)}`
      )
    }

    // Update each record's organic portion proportionally
    for (const rec of dateRecords) {
      const proportion = totalAllChannels > 0
        ? Number(rec.totalSales) / totalAllChannels
        : 0
      const organicPortion = organicAllChannels * proportion

      await prisma.salesDaily.update({
        where: { id: rec.id },
        data: {
          organicSales: organicPortion,
        },
      })

      updated++
    }
  }

  return updated
}

/**
 * Get daily sales summary for a brand
 */
export async function getDailySalesSummary(options: {
  brandId: string
  startDate: string
  endDate: string
  asin?: string
}): Promise<SalesDailySummary[]> {
  const { brandId, startDate, endDate, asin } = options

  const where: Prisma.SalesDailyWhereInput = {
    brandId,
    date: {
      gte: startOfDay(parseISO(startDate)),
      lte: endOfDay(parseISO(endDate)),
    },
    ...(asin && { asin }),
  }

  const records = await prisma.salesDaily.findMany({
    where,
    orderBy: { date: 'asc' },
  })

  // Group by date
  const byDate = new Map<string, {
    totalSales: number
    adAttributedSales: number
    organicSales: number
    orderCount: number
  }>()

  for (const record of records) {
    const dateKey = format(record.date, 'yyyy-MM-dd')
    const current = byDate.get(dateKey) || {
      totalSales: 0,
      adAttributedSales: 0,
      organicSales: 0,
      orderCount: 0,
    }

    byDate.set(dateKey, {
      totalSales: current.totalSales + Number(record.totalSales),
      adAttributedSales: current.adAttributedSales + Number(record.adAttributedSales),
      organicSales: current.organicSales + Number(record.organicSales),
      orderCount: current.orderCount + (record.unitsTotal || 0),
    })
  }

  // Convert to array
  const entries = Array.from(byDate.entries())
  return entries.map(([date, data]) => ({
    date,
    totalSales: data.totalSales,
    adAttributedSales: data.adAttributedSales,
    organicSales: data.organicSales,
    organicPercentage: calculateOrganicPercentage(data.totalSales, data.organicSales),
    orderCount: data.orderCount,
  }))
}

/**
 * Upsert a daily sales record
 */
export async function upsertDailySales(record: DailySalesRecord): Promise<void> {
  const existing = await prisma.salesDaily.findFirst({
    where: {
      brandId: record.brandId,
      date: record.date,
      channel: record.channel,
      ...(record.asin && { asin: record.asin }),
    },
  })

  if (existing) {
    await prisma.salesDaily.update({
      where: { id: existing.id },
      data: {
        totalSales: record.totalSales,
        adAttributedSales: record.adAttributedSales,
        organicSales: record.organicSales,
        unitsTotal: record.unitsTotal,
        unitsAdAttributed: record.unitsAdAttributed,
        unitsOrganic: record.unitsOrganic,
      },
    })
  } else {
    await prisma.salesDaily.create({
      data: {
        brandId: record.brandId,
        asin: record.asin,
        date: record.date,
        channel: record.channel,
        totalSales: record.totalSales,
        adAttributedSales: record.adAttributedSales,
        organicSales: record.organicSales,
        unitsTotal: record.unitsTotal,
        unitsAdAttributed: record.unitsAdAttributed,
        unitsOrganic: record.unitsOrganic,
      },
    })
  }
}
