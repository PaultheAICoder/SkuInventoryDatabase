/**
 * Budget and Bid Strategy Recommendations Service
 *
 * Identifies campaigns for budget increases (high-performers at budget limit)
 * and bid decreases (under-performers with ACOS above target).
 */

import { prisma } from '@/lib/db'
import type { ExpectedImpact, ConfidenceLevel } from '@/types/recommendations'
import type { RequiredThresholds } from '@/lib/recommendation-utils'
import { calculateConfidence, type DataQualityMetrics } from './confidence-scoring'

// ============================================
// Types
// ============================================

/**
 * Aggregated metrics at the campaign level
 */
export interface CampaignMetricsAggregate {
  campaignId: string
  campaignName: string
  dailyBudget: number
  totalSpend: number
  totalSales: number
  totalOrders: number
  totalImpressions: number
  totalClicks: number
  acos: number
  roas: number
  budgetUtilization: number
  dataPoints: number
}

/**
 * Campaign meeting budget increase criteria
 */
export interface BudgetIncreaseCandidate extends CampaignMetricsAggregate {
  suggestedDailyBudget: number
  expectedAdditionalSpend: number
}

/**
 * Campaign meeting bid decrease criteria
 */
export interface BidDecreaseCandidate extends CampaignMetricsAggregate {
  targetAcos: number
  suggestedBidReduction: number  // percentage (e.g., 0.15 = 15%)
  expectedAcosImprovement: number  // projected ACOS after reduction
}

/**
 * Generated budget increase recommendation (before DB insert)
 */
export interface BudgetRecommendation {
  type: 'BUDGET_INCREASE'
  keyword: string  // Will be campaign name for display
  keywordMetricId: string | null
  campaignId: string
  confidence: ConfidenceLevel
  rationale: string
  expectedImpact: ExpectedImpact
  metadata: {
    campaignName: string
    currentDailyBudget: number
    suggestedDailyBudget: number
    budgetUtilization: number
    currentAcos: number
    expectedAdditionalSpend: number
  }
}

/**
 * Generated bid decrease recommendation (before DB insert)
 */
export interface BidDecreaseRecommendation {
  type: 'BID_DECREASE'
  keyword: string  // Will be campaign name for display
  keywordMetricId: string | null
  campaignId: string
  confidence: ConfidenceLevel
  rationale: string
  expectedImpact: ExpectedImpact
  metadata: {
    campaignName: string
    currentAcos: number
    targetAcos: number
    suggestedBidReduction: number
    expectedAcosImprovement: number
  }
}

// ============================================
// Campaign Metrics Aggregation
// ============================================

/**
 * Aggregate KeywordMetric data at the campaign level for a brand
 *
 * @param brandId - Brand to analyze
 * @param lookbackDays - Days of data to aggregate
 * @returns Map of campaignId to aggregated metrics
 */
async function aggregateCampaignMetrics(
  brandId: string,
  lookbackDays: number
): Promise<Map<string, CampaignMetricsAggregate>> {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - lookbackDays)

  // Get all credentials for the brand to find portfolios and campaigns
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

  // Collect all campaign IDs with their budget info
  const campaignData: Map<string, { name: string; dailyBudget: number }> = new Map()

  for (const credential of credentials) {
    for (const portfolio of credential.adPortfolios) {
      for (const campaign of portfolio.campaigns) {
        // Only include campaigns with a defined daily budget
        if (campaign.dailyBudget) {
          campaignData.set(campaign.id, {
            name: campaign.name,
            dailyBudget: Number(campaign.dailyBudget),
          })
        }
      }
    }
  }

  if (campaignData.size === 0) {
    return new Map()
  }

  const campaignIds = Array.from(campaignData.keys())

  // Aggregate keyword metrics by campaign
  const campaignMetrics = await prisma.keywordMetric.groupBy({
    by: ['campaignId'],
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
      id: true, // Count of data points
    },
  })

  // Transform to CampaignMetricsAggregate
  const result: Map<string, CampaignMetricsAggregate> = new Map()

  for (const metric of campaignMetrics) {
    const campaignId = metric.campaignId
    if (!campaignId) continue

    const campaignInfo = campaignData.get(campaignId)
    if (!campaignInfo) continue

    const totalSpend = Number(metric._sum.spend ?? 0)
    const totalSales = Number(metric._sum.sales ?? 0)
    const totalOrders = Number(metric._sum.orders ?? 0)
    const totalImpressions = Number(metric._sum.impressions ?? 0)
    const totalClicks = Number(metric._sum.clicks ?? 0)
    const dataPoints = metric._count.id

    // Calculate metrics
    const acos = totalSales > 0 ? totalSpend / totalSales : 1
    const roas = totalSpend > 0 ? totalSales / totalSpend : 0

    // Calculate average daily spend
    const avgDailySpend = dataPoints > 0 ? totalSpend / dataPoints : 0

    // Calculate budget utilization
    const budgetUtilization = campaignInfo.dailyBudget > 0
      ? avgDailySpend / campaignInfo.dailyBudget
      : 0

    result.set(campaignId, {
      campaignId,
      campaignName: campaignInfo.name,
      dailyBudget: campaignInfo.dailyBudget,
      totalSpend,
      totalSales,
      totalOrders,
      totalImpressions,
      totalClicks,
      acos,
      roas,
      budgetUtilization,
      dataPoints,
    })
  }

  return result
}

// ============================================
// Budget Increase Candidates
// ============================================

/**
 * Find campaigns eligible for budget increase
 *
 * Criteria:
 * - Budget utilization >= threshold (default 95%)
 * - ACOS below maxAcosForIncrease (default 25%)
 * - OR ROAS above minRoas (default 1.5)
 *
 * @param brandId - Brand to analyze
 * @param lookbackDays - Days of data to consider
 * @param thresholds - Threshold settings
 * @returns Array of budget increase candidates
 */
export async function findBudgetIncreaseCandidates(
  brandId: string,
  lookbackDays: number = 30,
  thresholds: RequiredThresholds
): Promise<BudgetIncreaseCandidate[]> {
  const campaignMetrics = await aggregateCampaignMetrics(brandId, lookbackDays)

  const candidates: BudgetIncreaseCandidate[] = []

  for (const metrics of Array.from(campaignMetrics.values())) {
    // Check budget utilization threshold
    if (metrics.budgetUtilization < thresholds.budget.budgetUtilization) {
      continue
    }

    // Check performance: ACOS below max OR ROAS above min
    const maxAcos = thresholds.budget.maxAcosForIncrease ?? 0.25
    const meetsAcosThreshold = metrics.acos < maxAcos
    const meetsRoasThreshold = metrics.roas >= thresholds.budget.minRoas

    if (!meetsAcosThreshold && !meetsRoasThreshold) {
      continue
    }

    // Calculate suggested budget: 25% increase for proven performers
    const suggestedDailyBudget = metrics.dailyBudget * 1.25
    const expectedAdditionalSpend = suggestedDailyBudget - metrics.dailyBudget

    candidates.push({
      ...metrics,
      suggestedDailyBudget,
      expectedAdditionalSpend,
    })
  }

  // Sort by ROAS (best performers first)
  candidates.sort((a, b) => b.roas - a.roas)

  return candidates
}

// ============================================
// Bid Decrease Candidates
// ============================================

/**
 * Find campaigns eligible for bid decrease
 *
 * Criteria:
 * - ACOS above minAcosForDecrease (default 35%)
 * - ROAS below minRoas (default 1.5)
 *
 * @param brandId - Brand to analyze
 * @param lookbackDays - Days of data to consider
 * @param thresholds - Threshold settings
 * @returns Array of bid decrease candidates
 */
export async function findBidDecreaseCandidates(
  brandId: string,
  lookbackDays: number = 30,
  thresholds: RequiredThresholds
): Promise<BidDecreaseCandidate[]> {
  const campaignMetrics = await aggregateCampaignMetrics(brandId, lookbackDays)

  const candidates: BidDecreaseCandidate[] = []
  const minAcosForDecrease = thresholds.budget.minAcosForDecrease ?? 0.35
  const targetAcos = thresholds.budget.maxAcosForIncrease ?? 0.25  // Use max for increase as target

  for (const metrics of Array.from(campaignMetrics.values())) {
    // Check if ACOS is above decrease threshold
    if (metrics.acos < minAcosForDecrease) {
      continue
    }

    // Check if ROAS is below minimum (poor return)
    if (metrics.roas >= thresholds.budget.minRoas) {
      continue
    }

    // Calculate suggested bid reduction based on how far above target
    // Formula: reduction percentage = min(20%, (currentAcos - targetAcos) / currentAcos)
    // This ensures we don't reduce too aggressively
    const acosExcess = metrics.acos - targetAcos
    const reductionPercentage = Math.min(0.20, acosExcess / metrics.acos)
    const suggestedBidReduction = Math.max(0.15, reductionPercentage)  // At least 15%

    // Project expected ACOS improvement
    // Assumption: bid reduction leads to proportional ACOS improvement
    const expectedAcosImprovement = metrics.acos * (1 - suggestedBidReduction * 0.5)

    candidates.push({
      ...metrics,
      targetAcos,
      suggestedBidReduction,
      expectedAcosImprovement,
    })
  }

  // Sort by ACOS (worst performers first - they need the most attention)
  candidates.sort((a, b) => b.acos - a.acos)

  return candidates
}

// ============================================
// Rationale Builders
// ============================================

/**
 * Build human-readable rationale for budget increase recommendation
 */
export function buildBudgetIncreaseRationale(candidate: BudgetIncreaseCandidate): string {
  const utilization = (candidate.budgetUtilization * 100).toFixed(0)
  const currentAcos = (candidate.acos * 100).toFixed(1)
  const roas = candidate.roas.toFixed(2)
  const suggestedBudget = candidate.suggestedDailyBudget.toFixed(2)

  return (
    `Campaign '${candidate.campaignName}' is consistently hitting its budget limit ` +
    `(${utilization}% utilization) while maintaining strong performance ` +
    `(${currentAcos}% ACOS, ${roas}x ROAS). ` +
    `Increasing daily budget to $${suggestedBudget} would capture additional profitable traffic.`
  )
}

/**
 * Build human-readable rationale for bid decrease recommendation
 */
export function buildBidDecreaseRationale(candidate: BidDecreaseCandidate): string {
  const currentAcos = (candidate.acos * 100).toFixed(1)
  const targetAcos = (candidate.targetAcos * 100).toFixed(1)
  const reduction = (candidate.suggestedBidReduction * 100).toFixed(0)
  const expectedAcos = (candidate.expectedAcosImprovement * 100).toFixed(1)

  return (
    `Campaign '${candidate.campaignName}' has ACOS of ${currentAcos}%, significantly above ` +
    `the target of ${targetAcos}%. Reducing bids by ${reduction}% should improve ACOS ` +
    `towards ${expectedAcos}% while maintaining impression share.`
  )
}

// ============================================
// Impact Calculators
// ============================================

/**
 * Calculate expected impact of budget increase
 * Impact: Project additional daily spend with maintained ACOS
 */
export function calculateBudgetImpact(candidate: BudgetIncreaseCandidate): ExpectedImpact {
  // Calculate current daily sales based on ACOS
  const avgDailySpend = candidate.dataPoints > 0
    ? candidate.totalSpend / candidate.dataPoints
    : 0
  const avgDailySales = candidate.acos > 0
    ? avgDailySpend / candidate.acos
    : 0

  // Project sales with new budget (assuming same ACOS)
  const projectedDailySales = candidate.acos > 0
    ? candidate.suggestedDailyBudget / candidate.acos
    : avgDailySales

  return {
    metric: 'daily_sales',
    current: avgDailySales,
    projected: projectedDailySales,
  }
}

/**
 * Calculate expected impact of bid decrease
 * Impact: Project ACOS improvement from bid reduction
 */
export function calculateBidImpact(candidate: BidDecreaseCandidate): ExpectedImpact {
  return {
    metric: 'acos',
    current: candidate.acos,
    projected: candidate.expectedAcosImprovement,
  }
}

// ============================================
// Recommendation Generators
// ============================================

/**
 * Generate a budget increase recommendation
 *
 * @param candidate - Budget increase candidate
 * @returns BudgetRecommendation ready for database insertion
 */
export function generateBudgetRecommendation(
  candidate: BudgetIncreaseCandidate
): BudgetRecommendation {
  // Calculate confidence based on data quality
  const dataQuality: DataQualityMetrics = {
    dataPoints: candidate.dataPoints,
    impressions: candidate.totalImpressions,
    daysSpan: candidate.dataPoints,
  }

  const confidence = calculateConfidence(dataQuality)
  const rationale = buildBudgetIncreaseRationale(candidate)
  const expectedImpact = calculateBudgetImpact(candidate)

  return {
    type: 'BUDGET_INCREASE',
    keyword: candidate.campaignName,  // Use campaign name for display
    keywordMetricId: null,  // Campaign-level, no specific keyword metric
    campaignId: candidate.campaignId,
    confidence,
    rationale,
    expectedImpact,
    metadata: {
      campaignName: candidate.campaignName,
      currentDailyBudget: candidate.dailyBudget,
      suggestedDailyBudget: candidate.suggestedDailyBudget,
      budgetUtilization: candidate.budgetUtilization,
      currentAcos: candidate.acos,
      expectedAdditionalSpend: candidate.expectedAdditionalSpend,
    },
  }
}

/**
 * Generate a bid decrease recommendation
 *
 * @param candidate - Bid decrease candidate
 * @returns BidDecreaseRecommendation ready for database insertion
 */
export function generateBidDecreaseRecommendation(
  candidate: BidDecreaseCandidate
): BidDecreaseRecommendation {
  // Calculate confidence based on data quality
  const dataQuality: DataQualityMetrics = {
    dataPoints: candidate.dataPoints,
    impressions: candidate.totalImpressions,
    daysSpan: candidate.dataPoints,
  }

  const confidence = calculateConfidence(dataQuality)
  const rationale = buildBidDecreaseRationale(candidate)
  const expectedImpact = calculateBidImpact(candidate)

  return {
    type: 'BID_DECREASE',
    keyword: candidate.campaignName,  // Use campaign name for display
    keywordMetricId: null,  // Campaign-level, no specific keyword metric
    campaignId: candidate.campaignId,
    confidence,
    rationale,
    expectedImpact,
    metadata: {
      campaignName: candidate.campaignName,
      currentAcos: candidate.acos,
      targetAcos: candidate.targetAcos,
      suggestedBidReduction: candidate.suggestedBidReduction,
      expectedAcosImprovement: candidate.expectedAcosImprovement,
    },
  }
}
