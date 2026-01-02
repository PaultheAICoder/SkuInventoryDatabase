/**
 * Negative Keyword Suggestions Service
 *
 * Identifies keywords with high spend, zero conversions, and significant clicks
 * that should be added as negative keywords to stop wasting ad budget.
 */

import { prisma } from '@/lib/db'
import type { ExpectedImpact, ConfidenceLevel } from '@/types/recommendations'
import type { RequiredThresholds } from '@/lib/recommendation-utils'
import { calculateConfidence, type DataQualityMetrics } from './confidence-scoring'

// ============================================
// Types
// ============================================

/**
 * Represents a keyword candidate for negative keyword suggestion
 */
export interface NegativeKeywordCandidate {
  keyword: string
  campaignId: string
  campaignName: string
  matchType: string
  totalSpend: number
  totalOrders: number
  totalClicks: number
  totalImpressions: number
  totalSales: number
  dataPoints: number
}

/**
 * Generated negative keyword recommendation (before DB insert)
 */
export interface NegativeRecommendation {
  type: 'NEGATIVE_KEYWORD'
  keyword: string
  keywordMetricId: string | null
  campaignId: string
  confidence: ConfidenceLevel
  rationale: string
  expectedImpact: ExpectedImpact
  metadata: {
    campaigns: string[]
    campaignIds: string[]
    totalSpend: number
    totalClicks: number
    totalImpressions: number
  }
}

// ============================================
// Negative Keyword Finder
// ============================================

/**
 * Find keywords that should be negated based on poor performance
 * Criteria: high spend ($25+), zero conversions, significant clicks (50+)
 *
 * @param brandId - Brand to search for negative candidates
 * @param lookbackDays - Days of data to aggregate (default: 30)
 * @param thresholds - Threshold settings for negative keyword detection
 * @returns Array of negative keyword candidates with metrics
 */
export async function findNegativeKeywords(
  brandId: string,
  lookbackDays: number = 30,
  thresholds: RequiredThresholds
): Promise<NegativeKeywordCandidate[]> {
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

  // Filter and transform candidates
  const candidates: NegativeKeywordCandidate[] = []

  for (const metric of keywordMetrics) {
    const campaignId = metric.campaignId
    if (!campaignId) continue

    const totalSpend = Number(metric._sum.spend ?? 0)
    const totalOrders = Number(metric._sum.orders ?? 0)
    const totalSales = Number(metric._sum.sales ?? 0)
    const totalImpressions = Number(metric._sum.impressions ?? 0)
    const totalClicks = Number(metric._sum.clicks ?? 0)
    const dataPoints = metric._count.id

    const candidate: NegativeKeywordCandidate = {
      keyword: metric.keyword,
      campaignId,
      campaignName: campaignNameMap.get(campaignId) ?? 'Unknown Campaign',
      matchType: metric.matchType,
      totalSpend,
      totalOrders,
      totalClicks,
      totalImpressions,
      totalSales,
      dataPoints,
    }

    // Check if meets negative keyword thresholds
    if (meetsNegativeThresholds(candidate, thresholds)) {
      candidates.push(candidate)
    }
  }

  // Sort by total spend (highest waste first)
  candidates.sort((a, b) => b.totalSpend - a.totalSpend)

  return candidates
}

// ============================================
// Threshold Checking
// ============================================

/**
 * Check if a keyword meets the criteria for negative keyword suggestion
 * Criteria: spend >= minSpend, orders <= maxOrders (0), clicks >= minClicks
 */
export function meetsNegativeThresholds(
  metrics: NegativeKeywordCandidate,
  thresholds: RequiredThresholds
): boolean {
  const { negative } = thresholds
  return (
    metrics.totalSpend >= negative.minSpend &&
    metrics.totalOrders <= negative.maxOrders &&
    metrics.totalClicks >= negative.minClicks
  )
}

// ============================================
// Recommendation Generation
// ============================================

/**
 * Build human-readable rationale for negative keyword recommendation
 */
export function buildNegativeRationale(keyword: string, metrics: NegativeKeywordCandidate): string {
  const spend = metrics.totalSpend.toFixed(2)
  const clicks = metrics.totalClicks
  const impressions = metrics.totalImpressions.toLocaleString()
  const ctr = metrics.totalImpressions > 0
    ? ((metrics.totalClicks / metrics.totalImpressions) * 100).toFixed(2)
    : '0.00'

  return (
    `Keyword '${keyword}' has spent $${spend} with ${clicks} clicks and ${impressions} impressions ` +
    `(${ctr}% CTR) but generated 0 orders. ` +
    `Consider adding as a negative keyword in campaign '${metrics.campaignName}' to stop wasting ad budget.`
  )
}

/**
 * Calculate expected impact of negating the keyword
 * Impact: 100% spend savings (all current spend would be saved)
 */
export function calculateNegativeImpact(metrics: NegativeKeywordCandidate): ExpectedImpact {
  // When negating a keyword, we expect to save all current spend
  // Since it's generating no conversions, the projected spend is 0
  return {
    metric: 'spend',
    current: metrics.totalSpend,
    projected: 0, // All spend saved by negating
  }
}

/**
 * Generate a negative keyword recommendation
 *
 * @param metrics - Keyword metrics for the negative candidate
 * @param keywordMetricId - Reference to most recent KeywordMetric record
 * @param campaignId - Campaign where keyword should be negated
 * @param campaignName - Campaign name for display
 * @returns NegativeRecommendation ready for database insertion
 */
export function generateNegativeRecommendation(
  metrics: NegativeKeywordCandidate,
  keywordMetricId: string | null,
  campaignId: string,
  campaignName: string
): NegativeRecommendation {
  // Calculate confidence based on data quality
  const dataQuality: DataQualityMetrics = {
    dataPoints: metrics.dataPoints,
    impressions: metrics.totalImpressions,
    daysSpan: metrics.dataPoints, // Assume continuous for now
  }

  const confidence = calculateConfidence(dataQuality)

  const rationale = buildNegativeRationale(metrics.keyword, metrics)
  const expectedImpact = calculateNegativeImpact(metrics)

  return {
    type: 'NEGATIVE_KEYWORD',
    keyword: metrics.keyword,
    keywordMetricId,
    campaignId,
    confidence,
    rationale,
    expectedImpact,
    metadata: {
      campaigns: [campaignName],
      campaignIds: [campaignId],
      totalSpend: metrics.totalSpend,
      totalClicks: metrics.totalClicks,
      totalImpressions: metrics.totalImpressions,
    },
  }
}
