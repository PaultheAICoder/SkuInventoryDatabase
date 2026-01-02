/**
 * Keyword Graduation Service
 *
 * Provides campaign classification and graduation threshold checking
 * for the recommendation engine. Identifies high-performing keywords
 * in Discovery campaigns that are ready for graduation to Accelerate campaigns.
 */

import type { RequiredThresholds } from '@/lib/recommendation-utils'
import type { ExpectedImpact, ConfidenceLevel } from '@/types/recommendations'
import { calculateConfidence, type DataQualityMetrics } from './confidence-scoring'

// ============================================
// Campaign Classification
// ============================================

/**
 * Campaign type classification based on name patterns
 */
export type CampaignCategory = 'discovery' | 'accelerate' | 'unknown'

/**
 * Pattern matchers for campaign classification
 */
const DISCOVERY_PATTERNS = [
  /discovery/i,
  /research/i,
  /explore/i,
  /test/i,
  /broad/i,
]

const ACCELERATE_PATTERNS = [
  /accelerate/i,
  /exact/i,
  /scale/i,
  /performance/i,
  /convert/i,
]

/**
 * Classify campaign by name pattern
 * Discovery: contains "discovery", "research", "auto" (targeting type)
 * Accelerate: contains "accelerate", "exact", "scale"
 *
 * Name patterns take priority over targeting type.
 * If both discovery and accelerate patterns match, accelerate wins
 * (more specific/intentional naming).
 */
export function classifyCampaign(
  campaignName: string,
  targetingType?: string
): CampaignCategory {
  const nameLower = campaignName.toLowerCase()

  // Check name patterns first - accelerate is more specific/intentional
  const hasAcceleratePattern = ACCELERATE_PATTERNS.some(pattern => pattern.test(nameLower))
  const hasDiscoveryPattern = DISCOVERY_PATTERNS.some(pattern => pattern.test(nameLower))

  // Accelerate pattern in name takes priority
  if (hasAcceleratePattern) {
    return 'accelerate'
  }

  // Discovery pattern in name
  if (hasDiscoveryPattern) {
    return 'discovery'
  }

  // Fallback to targeting type if no name patterns match
  if (targetingType?.toLowerCase() === 'auto') {
    return 'discovery'
  }

  return 'unknown'
}

/**
 * Check if a campaign is a Discovery campaign
 */
export function isDiscoveryCampaign(
  campaignName: string,
  targetingType?: string
): boolean {
  return classifyCampaign(campaignName, targetingType) === 'discovery'
}

/**
 * Check if a campaign is an Accelerate campaign
 */
export function isAccelerateCampaign(
  campaignName: string,
  targetingType?: string
): boolean {
  return classifyCampaign(campaignName, targetingType) === 'accelerate'
}

// ============================================
// Graduation Threshold Types
// ============================================

/**
 * Aggregated keyword metrics for graduation analysis
 */
export interface KeywordMetricsAggregate {
  keyword: string
  campaignId: string
  campaignName: string
  matchType: string
  totalSpend: number      // Sum of spend over period
  totalOrders: number     // Sum of orders (conversions) over period
  totalSales: number      // Sum of sales over period
  totalImpressions: number
  totalClicks: number
  acos: number            // Calculated: spend / sales
  dataPoints: number      // Number of days with data (for confidence)
}

/**
 * Detailed graduation eligibility breakdown
 */
export interface GraduationEligibility {
  eligible: boolean
  acosBelowThreshold: boolean
  meetsConversionMin: boolean
  meetsSpendMin: boolean
  metrics: {
    currentAcos: number
    currentConversions: number
    currentSpend: number
  }
  thresholds: {
    maxAcos: number
    minConversions: number
    minSpend: number
  }
}

// ============================================
// Graduation Threshold Checks
// ============================================

/**
 * Check if a keyword meets graduation thresholds
 * Thresholds: ACOS < 25%, conversions >= 5, spend >= $50
 */
export function meetsGraduationThresholds(
  metrics: KeywordMetricsAggregate,
  thresholds: RequiredThresholds
): boolean {
  const { graduation } = thresholds

  // ACOS check (lower is better, must be below max)
  const acosPasses = metrics.acos <= graduation.maxAcos

  // Conversions check (must meet minimum)
  const conversionsPasses = metrics.totalOrders >= graduation.minConversions

  // Spend check (must meet minimum to ensure statistical significance)
  const spendPasses = metrics.totalSpend >= graduation.minSpend

  return acosPasses && conversionsPasses && spendPasses
}

/**
 * Get detailed graduation eligibility with which criteria pass/fail
 */
export function getGraduationEligibility(
  metrics: KeywordMetricsAggregate,
  thresholds: RequiredThresholds
): GraduationEligibility {
  const { graduation } = thresholds

  const acosBelowThreshold = metrics.acos <= graduation.maxAcos
  const meetsConversionMin = metrics.totalOrders >= graduation.minConversions
  const meetsSpendMin = metrics.totalSpend >= graduation.minSpend

  return {
    eligible: acosBelowThreshold && meetsConversionMin && meetsSpendMin,
    acosBelowThreshold,
    meetsConversionMin,
    meetsSpendMin,
    metrics: {
      currentAcos: metrics.acos,
      currentConversions: metrics.totalOrders,
      currentSpend: metrics.totalSpend,
    },
    thresholds: {
      maxAcos: graduation.maxAcos,
      minConversions: graduation.minConversions,
      minSpend: graduation.minSpend,
    },
  }
}

// ============================================
// Recommendation Generation Types
// ============================================

/**
 * Generated graduation recommendation (before DB insert)
 */
export interface GraduationRecommendation {
  type: 'KEYWORD_GRADUATION'
  keyword: string
  keywordMetricId: string | null  // Reference to most recent KeywordMetric
  campaignId: string              // Source Discovery campaign
  confidence: ConfidenceLevel
  rationale: string
  expectedImpact: ExpectedImpact
  metadata: {
    sourceCampaign: string        // Campaign name
    sourceCampaignType: string    // e.g., 'discovery'
    metrics: KeywordMetricsAggregate
    eligibility: GraduationEligibility
  }
}

// ============================================
// Recommendation Generation Functions
// ============================================

/**
 * Build human-readable rationale for graduation recommendation
 */
export function buildGraduationRationale(
  keyword: string,
  metrics: KeywordMetricsAggregate,
  eligibility: GraduationEligibility
): string {
  const acosPercent = (metrics.acos * 100).toFixed(1)
  const spendFormatted = metrics.totalSpend.toFixed(2)
  const maxAcosPercent = (eligibility.thresholds.maxAcos * 100).toFixed(0)

  return (
    `Keyword '${keyword}' has achieved ${acosPercent}% ACOS with ` +
    `${metrics.totalOrders} conversion${metrics.totalOrders !== 1 ? 's' : ''} ` +
    `and $${spendFormatted} spend over ${metrics.dataPoints} day${metrics.dataPoints !== 1 ? 's' : ''} ` +
    `in Discovery campaign '${metrics.campaignName}'. ` +
    `Meets all graduation criteria (ACOS < ${maxAcosPercent}%, min ${eligibility.thresholds.minConversions} conversions, min $${eligibility.thresholds.minSpend} spend). ` +
    `Ready to graduate to Accelerate for scaling.`
  )
}

/**
 * Calculate expected impact of graduating a keyword
 * Projects ACOS improvement and potential sales increase
 */
export function calculateGraduationImpact(
  metrics: KeywordMetricsAggregate
): ExpectedImpact {
  // When graduating to exact match in Accelerate, we typically see:
  // - 10-20% ACOS improvement due to higher relevance
  // - Potential sales increase from more targeted bidding
  const currentAcos = metrics.acos
  const projectedAcos = currentAcos * 0.85 // Estimate 15% improvement

  return {
    metric: 'acos',
    current: currentAcos,
    projected: Math.max(0, projectedAcos),
  }
}

/**
 * Generate graduation recommendation for an eligible keyword
 */
export function generateGraduationRecommendation(
  metrics: KeywordMetricsAggregate,
  keywordMetricId: string | null,
  campaignId: string,
  campaignName: string
): GraduationRecommendation {
  // Import thresholds to calculate eligibility
  // Note: Using default thresholds for eligibility calculation in recommendation generation
  // The actual thresholds used for filtering are passed to the generator
  const DEFAULT_GRADUATION_THRESHOLDS = {
    graduation: {
      maxAcos: 0.25,
      minConversions: 5,
      minSpend: 50,
    },
    negative: {
      minSpend: 25,
      maxOrders: 0,
      minClicks: 50,
    },
    budget: {
      minRoas: 1.5,
      budgetUtilization: 0.95,
    },
  }

  const eligibility = getGraduationEligibility(metrics, DEFAULT_GRADUATION_THRESHOLDS)

  // Calculate confidence based on data quality
  const dataQuality: DataQualityMetrics = {
    dataPoints: metrics.dataPoints,
    impressions: metrics.totalImpressions,
    daysSpan: metrics.dataPoints, // Assume continuous for now
  }

  const confidence = calculateConfidence(dataQuality)

  const rationale = buildGraduationRationale(metrics.keyword, metrics, eligibility)
  const expectedImpact = calculateGraduationImpact(metrics)

  return {
    type: 'KEYWORD_GRADUATION',
    keyword: metrics.keyword,
    keywordMetricId,
    campaignId,
    confidence,
    rationale,
    expectedImpact,
    metadata: {
      sourceCampaign: campaignName,
      sourceCampaignType: 'discovery',
      metrics,
      eligibility,
    },
  }
}
