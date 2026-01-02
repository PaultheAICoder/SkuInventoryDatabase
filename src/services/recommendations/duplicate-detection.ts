/**
 * Duplicate Keyword Detection Service
 *
 * Identifies keywords appearing in multiple campaigns for the same brand.
 * Prevents bidding against yourself by flagging duplicates for consolidation.
 */

import { prisma } from '@/lib/db'
import type { ExpectedImpact, ConfidenceLevel } from '@/types/recommendations'
import { calculateConfidence, type DataQualityMetrics } from './confidence-scoring'

// ============================================
// Types
// ============================================

/**
 * Represents a single campaign occurrence of a keyword
 */
export interface CampaignOccurrence {
  campaignId: string
  campaignName: string
  matchType: string
  spend: number
  orders: number
  sales: number
  impressions: number
  clicks: number
  acos: number
  dataPoints: number
}

/**
 * Group of campaigns where a keyword appears
 */
export interface DuplicateKeywordGroup {
  keyword: string
  brandId: string
  occurrences: CampaignOccurrence[]
  totalSpend: number
  totalOrders: number
  totalSales: number
  totalImpressions: number
  totalClicks: number
  totalDataPoints: number
}

/**
 * Generated duplicate keyword recommendation (before DB insert)
 */
export interface DuplicateRecommendation {
  type: 'DUPLICATE_KEYWORD'
  keyword: string
  keywordMetricId: string | null
  campaignId: string | null // null for duplicates - spans multiple campaigns
  confidence: ConfidenceLevel
  rationale: string
  expectedImpact: ExpectedImpact
  metadata: {
    occurrences: CampaignOccurrence[]
    totalCampaigns: number
    totalSpend: number
    totalOrders: number
    potentialSavings: number
  }
}

// ============================================
// Duplicate Finder
// ============================================

/**
 * Find keywords that appear in multiple campaigns for a brand
 * These duplicates may cause the brand to bid against itself
 *
 * @param brandId - Brand to search for duplicates
 * @param lookbackDays - Days of data to aggregate (default: 30)
 * @returns Array of duplicate keyword groups with metrics
 */
export async function findDuplicateKeywords(
  brandId: string,
  lookbackDays: number = 30
): Promise<DuplicateKeywordGroup[]> {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - lookbackDays)

  // Get all credentials for the brand to find portfolios
  const credentials = await prisma.integrationCredential.findMany({
    where: {
      brandId,
      integrationType: 'amazon_ads',
      status: 'active',
    },
    include: {
      adPortfolios: {
        include: {
          campaigns: true,
        },
      },
    },
  })

  // Collect all campaign IDs and build name map
  const campaignIds: string[] = []
  const campaignNameMap: Map<string, string> = new Map()

  for (const credential of credentials) {
    for (const portfolio of credential.adPortfolios) {
      for (const campaign of portfolio.campaigns) {
        campaignIds.push(campaign.id)
        campaignNameMap.set(campaign.id, campaign.name)
      }
    }
  }

  if (campaignIds.length === 0) {
    return []
  }

  // Aggregate keyword metrics across all campaigns
  const keywordMetrics = await prisma.keywordMetric.groupBy({
    by: ['keyword', 'campaignId', 'matchType'],
    where: {
      campaignId: { in: campaignIds },
      date: { gte: startDate },
    },
    _sum: {
      spend: true,
      orders: true,
      sales: true,
      impressions: true,
      clicks: true,
    },
    _count: {
      id: true, // Count of data points (days)
    },
  })

  // Group metrics by keyword to find duplicates
  const keywordMap = new Map<string, Array<{
    campaignId: string
    matchType: string
    spend: number
    orders: number
    sales: number
    impressions: number
    clicks: number
    dataPoints: number
  }>>()

  for (const metric of keywordMetrics) {
    const campaignId = metric.campaignId
    if (!campaignId) continue

    const spend = Number(metric._sum.spend ?? 0)
    const orders = Number(metric._sum.orders ?? 0)
    const sales = Number(metric._sum.sales ?? 0)
    const impressions = Number(metric._sum.impressions ?? 0)
    const clicks = Number(metric._sum.clicks ?? 0)
    const dataPoints = metric._count.id

    const entry = {
      campaignId,
      matchType: metric.matchType,
      spend,
      orders,
      sales,
      impressions,
      clicks,
      dataPoints,
    }

    const existing = keywordMap.get(metric.keyword)
    if (existing) {
      existing.push(entry)
    } else {
      keywordMap.set(metric.keyword, [entry])
    }
  }

  // Filter to only keywords appearing in 2+ campaigns (different campaign IDs)
  const duplicateGroups: DuplicateKeywordGroup[] = []

  keywordMap.forEach((entries, keyword) => {
    // Get unique campaign IDs
    const uniqueCampaignIds = new Set(entries.map((e) => e.campaignId))

    if (uniqueCampaignIds.size < 2) {
      // Not a duplicate - only in one campaign
      return
    }

    // Build occurrences array
    const occurrences: CampaignOccurrence[] = entries.map(entry => ({
      campaignId: entry.campaignId,
      campaignName: campaignNameMap.get(entry.campaignId) ?? 'Unknown Campaign',
      matchType: entry.matchType,
      spend: entry.spend,
      orders: entry.orders,
      sales: entry.sales,
      impressions: entry.impressions,
      clicks: entry.clicks,
      acos: entry.sales > 0 ? entry.spend / entry.sales : 1,
      dataPoints: entry.dataPoints,
    }))

    // Calculate totals
    const totalSpend = occurrences.reduce((sum, o) => sum + o.spend, 0)
    const totalOrders = occurrences.reduce((sum, o) => sum + o.orders, 0)
    const totalSales = occurrences.reduce((sum, o) => sum + o.sales, 0)
    const totalImpressions = occurrences.reduce((sum, o) => sum + o.impressions, 0)
    const totalClicks = occurrences.reduce((sum, o) => sum + o.clicks, 0)
    const totalDataPoints = occurrences.reduce((sum, o) => sum + o.dataPoints, 0)

    duplicateGroups.push({
      keyword,
      brandId,
      occurrences,
      totalSpend,
      totalOrders,
      totalSales,
      totalImpressions,
      totalClicks,
      totalDataPoints,
    })
  })

  // Sort by total spend (highest impact first)
  duplicateGroups.sort((a, b) => b.totalSpend - a.totalSpend)

  return duplicateGroups
}

// ============================================
// Recommendation Generation
// ============================================

/**
 * Build human-readable rationale for duplicate keyword recommendation
 */
export function buildDuplicateRationale(group: DuplicateKeywordGroup): string {
  const campaignCount = group.occurrences.length
  const campaignNames = group.occurrences.map(o => o.campaignName).join(', ')
  const totalSpend = group.totalSpend.toFixed(2)
  const avgAcos = group.totalSales > 0
    ? ((group.totalSpend / group.totalSales) * 100).toFixed(1)
    : 'N/A'

  return (
    `Keyword '${group.keyword}' appears in ${campaignCount} campaigns: ${campaignNames}. ` +
    `Total spend: $${totalSpend}, Total orders: ${group.totalOrders}, Combined ACOS: ${avgAcos}%. ` +
    `Consider consolidating to a single campaign to avoid bidding against yourself and optimize ad spend.`
  )
}

/**
 * Calculate expected impact of consolidating duplicate keywords
 * Estimates potential spend savings from consolidation
 */
export function calculateDuplicateImpact(group: DuplicateKeywordGroup): ExpectedImpact {
  // When consolidating duplicates, we expect:
  // - Reduced internal competition leading to lower CPCs
  // - Estimated 15-25% spend reduction while maintaining orders
  const currentSpend = group.totalSpend
  const projectedSpend = currentSpend * 0.80 // Conservative 20% savings estimate

  return {
    metric: 'spend',
    current: currentSpend,
    projected: Math.max(0, projectedSpend),
  }
}

/**
 * Generate a duplicate keyword recommendation for a group
 *
 * @param group - Duplicate keyword group with metrics
 * @param keywordMetricId - Optional reference to a KeywordMetric record
 * @returns DuplicateRecommendation ready for database insertion
 */
export function generateDuplicateRecommendation(
  group: DuplicateKeywordGroup,
  keywordMetricId: string | null
): DuplicateRecommendation {
  // Calculate confidence based on aggregate data quality
  const dataQuality: DataQualityMetrics = {
    dataPoints: group.totalDataPoints,
    impressions: group.totalImpressions,
    daysSpan: group.totalDataPoints, // Assume continuous for now
  }

  const confidence = calculateConfidence(dataQuality)

  const rationale = buildDuplicateRationale(group)
  const expectedImpact = calculateDuplicateImpact(group)

  // Calculate potential savings (difference between current and projected spend)
  const potentialSavings = group.totalSpend - expectedImpact.projected

  return {
    type: 'DUPLICATE_KEYWORD',
    keyword: group.keyword,
    keywordMetricId,
    campaignId: null, // Duplicates span multiple campaigns
    confidence,
    rationale,
    expectedImpact,
    metadata: {
      occurrences: group.occurrences,
      totalCampaigns: group.occurrences.length,
      totalSpend: group.totalSpend,
      totalOrders: group.totalOrders,
      potentialSavings,
    },
  }
}
