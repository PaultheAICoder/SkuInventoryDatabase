/**
 * Recommendation Generator Orchestrator
 *
 * Coordinates recommendation generation for a brand.
 * Implements: KEYWORD_GRADUATION, DUPLICATE_KEYWORD, NEGATIVE_KEYWORD, BUDGET_INCREASE, BID_DECREASE
 */

import { prisma } from '@/lib/db'
import { mergeThresholds, type RequiredThresholds } from '@/lib/recommendation-utils'
import type { RecommendationThresholds } from '@/types/recommendations'
import {
  isDiscoveryCampaign,
  meetsGraduationThresholds,
  generateGraduationRecommendation,
  type KeywordMetricsAggregate,
  type GraduationRecommendation,
} from './keyword-graduation'
import {
  findDuplicateKeywords,
  generateDuplicateRecommendation,
  type DuplicateRecommendation,
} from './duplicate-detection'
import {
  findNegativeKeywords,
  generateNegativeRecommendation,
  type NegativeRecommendation,
} from './negative-suggestions'
import {
  findBudgetIncreaseCandidates,
  findBidDecreaseCandidates,
  generateBudgetRecommendation,
  generateBidDecreaseRecommendation,
  type BudgetRecommendation,
  type BidDecreaseRecommendation,
} from './budget-strategy'

// Union type for all recommendation types
type AnyRecommendation =
  | GraduationRecommendation
  | DuplicateRecommendation
  | NegativeRecommendation
  | BudgetRecommendation
  | BidDecreaseRecommendation

// ============================================
// Types
// ============================================

export interface GenerateRecommendationsOptions {
  brandId: string
  lookbackDays?: number  // Default: 30
  dryRun?: boolean       // If true, don't save to DB, just return recommendations
}

export interface GenerateRecommendationsResult {
  generated: number
  skipped: number
  errors: string[]
  recommendations: Array<{
    type: string
    keyword: string
    confidence: string
  }>
}

// ============================================
// Main Generator Function
// ============================================

/**
 * Generate all recommendations for a brand
 * Implements: KEYWORD_GRADUATION, DUPLICATE_KEYWORD, NEGATIVE_KEYWORD, BUDGET_INCREASE, BID_DECREASE
 */
export async function generateRecommendations(
  options: GenerateRecommendationsOptions
): Promise<GenerateRecommendationsResult> {
  const { brandId, lookbackDays = 30, dryRun = false } = options

  const errors: string[] = []
  const recommendations: AnyRecommendation[] = []

  try {
    // Get brand settings for custom thresholds
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      include: { company: true },
    })

    if (!brand) {
      return {
        generated: 0,
        skipped: 0,
        errors: [`Brand not found: ${brandId}`],
        recommendations: [],
      }
    }

    // Merge brand thresholds with defaults
    const companySettings = brand.company.settings as { recommendationThresholds?: RecommendationThresholds } | null
    const thresholds = mergeThresholds(companySettings?.recommendationThresholds)

    // Find graduation candidates
    const candidates = await findGraduationCandidates(brandId, thresholds, lookbackDays)

    // Generate recommendations for each candidate
    for (const candidate of candidates) {
      try {
        // Find the most recent KeywordMetric ID for reference
        const latestMetric = await findLatestKeywordMetricId(
          candidate.keyword,
          candidate.campaignId
        )

        const recommendation = generateGraduationRecommendation(
          candidate,
          latestMetric,
          candidate.campaignId,
          candidate.campaignName
        )

        recommendations.push(recommendation)
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error'
        errors.push(`Error generating recommendation for "${candidate.keyword}": ${errMsg}`)
      }
    }

    // Find duplicate keywords
    const duplicateGroups = await findDuplicateKeywords(brandId, lookbackDays)

    // Generate recommendations for each duplicate group
    for (const group of duplicateGroups) {
      try {
        // Find the most recent KeywordMetric ID for reference (from first occurrence)
        const latestMetric = await findLatestKeywordMetricId(
          group.keyword,
          group.occurrences[0].campaignId
        )
        const recommendation = generateDuplicateRecommendation(group, latestMetric)
        recommendations.push(recommendation)
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error'
        errors.push(`Error generating duplicate recommendation for "${group.keyword}": ${errMsg}`)
      }
    }

    // Find negative keyword candidates
    const negativeCandidates = await findNegativeKeywords(brandId, lookbackDays, thresholds)

    // Generate recommendations for each negative keyword candidate
    for (const candidate of negativeCandidates) {
      try {
        const latestMetric = await findLatestKeywordMetricId(
          candidate.keyword,
          candidate.campaignId
        )
        const recommendation = generateNegativeRecommendation(
          candidate,
          latestMetric,
          candidate.campaignId,
          candidate.campaignName
        )
        recommendations.push(recommendation)
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error'
        errors.push(`Error generating negative recommendation for "${candidate.keyword}": ${errMsg}`)
      }
    }

    // Find budget increase candidates
    const budgetCandidates = await findBudgetIncreaseCandidates(brandId, lookbackDays, thresholds)

    // Generate recommendations for each budget increase candidate
    for (const candidate of budgetCandidates) {
      try {
        const recommendation = generateBudgetRecommendation(candidate)
        recommendations.push(recommendation)
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error'
        errors.push(`Error generating budget recommendation for "${candidate.campaignName}": ${errMsg}`)
      }
    }

    // Find bid decrease candidates
    const bidDecreaseCandidates = await findBidDecreaseCandidates(brandId, lookbackDays, thresholds)

    // Generate recommendations for each bid decrease candidate
    for (const candidate of bidDecreaseCandidates) {
      try {
        const recommendation = generateBidDecreaseRecommendation(candidate)
        recommendations.push(recommendation)
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error'
        errors.push(`Error generating bid decrease recommendation for "${candidate.campaignName}": ${errMsg}`)
      }
    }

    // Save recommendations unless dry run
    let saved = 0
    let skipped = 0

    if (!dryRun && recommendations.length > 0) {
      const saveResult = await saveRecommendations(brandId, recommendations)
      saved = saveResult.saved
      skipped = saveResult.skipped
    } else {
      saved = recommendations.length
    }

    return {
      generated: saved,
      skipped,
      errors,
      recommendations: recommendations.map(r => ({
        type: r.type,
        keyword: r.keyword,
        confidence: r.confidence,
      })),
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error'
    errors.push(`Fatal error: ${errMsg}`)
    return {
      generated: 0,
      skipped: 0,
      errors,
      recommendations: [],
    }
  }
}

// ============================================
// Candidate Finder
// ============================================

/**
 * Find keywords eligible for graduation
 * Queries KeywordMetric aggregated over lookback period
 */
export async function findGraduationCandidates(
  brandId: string,
  thresholds: RequiredThresholds,
  lookbackDays: number
): Promise<KeywordMetricsAggregate[]> {
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

  // Collect all Discovery campaign IDs
  const discoveryCampaignIds: string[] = []
  const campaignNameMap: Map<string, string> = new Map()

  for (const credential of credentials) {
    for (const portfolio of credential.adPortfolios) {
      for (const campaign of portfolio.campaigns) {
        if (isDiscoveryCampaign(campaign.name, campaign.targetingType ?? undefined)) {
          discoveryCampaignIds.push(campaign.id)
          campaignNameMap.set(campaign.id, campaign.name)
        }
      }
    }
  }

  if (discoveryCampaignIds.length === 0) {
    return []
  }

  // Aggregate keyword metrics for Discovery campaigns
  const keywordMetrics = await prisma.keywordMetric.groupBy({
    by: ['keyword', 'campaignId', 'matchType'],
    where: {
      campaignId: { in: discoveryCampaignIds },
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

  // Transform and filter candidates
  const candidates: KeywordMetricsAggregate[] = []

  for (const metric of keywordMetrics) {
    const totalSpend = Number(metric._sum.spend ?? 0)
    const totalSales = Number(metric._sum.sales ?? 0)
    const totalOrders = Number(metric._sum.orders ?? 0)
    const totalImpressions = Number(metric._sum.impressions ?? 0)
    const totalClicks = Number(metric._sum.clicks ?? 0)
    const dataPoints = metric._count.id

    // Calculate ACOS (spend / sales, default to 1 if no sales)
    const acos = totalSales > 0 ? totalSpend / totalSales : 1

    // Ensure campaignId is defined
    const campaignId = metric.campaignId
    if (!campaignId) continue

    const aggregate: KeywordMetricsAggregate = {
      keyword: metric.keyword,
      campaignId,
      campaignName: campaignNameMap.get(campaignId) ?? 'Unknown Campaign',
      matchType: metric.matchType,
      totalSpend,
      totalOrders,
      totalSales,
      totalImpressions,
      totalClicks,
      acos,
      dataPoints,
    }

    // Check if meets thresholds
    if (meetsGraduationThresholds(aggregate, thresholds)) {
      candidates.push(aggregate)
    }
  }

  return candidates
}

// ============================================
// Helper Functions
// ============================================

/**
 * Find the most recent KeywordMetric ID for a keyword in a campaign
 */
async function findLatestKeywordMetricId(
  keyword: string,
  campaignId: string
): Promise<string | null> {
  const latest = await prisma.keywordMetric.findFirst({
    where: {
      keyword,
      campaignId,
    },
    orderBy: {
      date: 'desc',
    },
    select: {
      id: true,
    },
  })

  return latest?.id ?? null
}

/**
 * Save generated recommendations to database
 * Avoids duplicates by checking for existing PENDING recommendations
 *
 * For KEYWORD_GRADUATION: checks by keyword + campaignId (within a specific campaign)
 * For DUPLICATE_KEYWORD: checks by keyword only (spans multiple campaigns)
 * For NEGATIVE_KEYWORD: checks by keyword + campaignId (specific campaign)
 * For BUDGET_INCREASE: checks by campaignId only (campaign-level, no keyword)
 * For BID_DECREASE: checks by campaignId only (campaign-level, no keyword)
 */
async function saveRecommendations(
  brandId: string,
  recommendations: AnyRecommendation[]
): Promise<{ saved: number; skipped: number }> {
  let saved = 0
  let skipped = 0

  for (const rec of recommendations) {
    try {
      // Check for existing PENDING recommendation
      // DUPLICATE_KEYWORD: check by keyword only (no campaignId, spans multiple campaigns)
      // KEYWORD_GRADUATION, NEGATIVE_KEYWORD: check by keyword + campaignId (specific campaign)
      // BUDGET_INCREASE, BID_DECREASE: check by campaignId only (campaign-level)
      let whereClause
      if (rec.type === 'DUPLICATE_KEYWORD') {
        whereClause = {
          brandId,
          type: 'DUPLICATE_KEYWORD' as const,
          status: 'PENDING' as const,
          keyword: rec.keyword,
        }
      } else if (rec.type === 'NEGATIVE_KEYWORD') {
        whereClause = {
          brandId,
          type: 'NEGATIVE_KEYWORD' as const,
          status: 'PENDING' as const,
          keyword: rec.keyword,
          campaignId: rec.campaignId,
        }
      } else if (rec.type === 'BUDGET_INCREASE') {
        whereClause = {
          brandId,
          type: 'BUDGET_INCREASE' as const,
          status: 'PENDING' as const,
          campaignId: rec.campaignId,
        }
      } else if (rec.type === 'BID_DECREASE') {
        whereClause = {
          brandId,
          type: 'BID_DECREASE' as const,
          status: 'PENDING' as const,
          campaignId: rec.campaignId,
        }
      } else {
        whereClause = {
          brandId,
          type: 'KEYWORD_GRADUATION' as const,
          status: 'PENDING' as const,
          keyword: rec.keyword,
          campaignId: rec.campaignId,
        }
      }

      const existing = await prisma.recommendation.findFirst({
        where: whereClause,
      })

      if (existing) {
        // Already have a pending recommendation, skip
        skipped++
        continue
      }

      // Create new recommendation
      // Cast to JSON-compatible format for Prisma
      await prisma.recommendation.create({
        data: {
          brandId,
          type: rec.type,
          status: 'PENDING',
          confidence: rec.confidence,
          keyword: rec.keyword,
          keywordMetricId: rec.keywordMetricId,
          campaignId: rec.campaignId,
          rationale: rec.rationale,
          expectedImpact: JSON.parse(JSON.stringify(rec.expectedImpact)),
          metadata: JSON.parse(JSON.stringify(rec.metadata)),
          generatedAt: new Date(),
        },
      })

      saved++
    } catch (error) {
      // Log but don't fail entire batch
      console.error(`Failed to save recommendation for "${rec.keyword}":`, error)
    }
  }

  return { saved, skipped }
}
