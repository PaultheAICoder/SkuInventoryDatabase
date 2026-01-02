/**
 * Recommendation Engine Utilities
 * Shared utility functions and constants for the recommendation engine
 */

import type { RecommendationThresholds, Recommendation } from '@/types/recommendations'

// ============================================
// Default Threshold Constants
// ============================================

/**
 * Required thresholds type - all fields are guaranteed to have values
 */
export interface RequiredThresholds {
  graduation: {
    maxAcos: number
    minConversions: number
    minSpend: number
  }
  negative: {
    minSpend: number
    maxOrders: number
    minClicks: number
  }
  budget: {
    minRoas: number
    budgetUtilization: number
  }
}

/**
 * Default thresholds for recommendation generation.
 * These can be overridden per-brand via Brand.settings.recommendationThresholds
 */
export const DEFAULT_THRESHOLDS: RequiredThresholds = {
  graduation: {
    /** Maximum ACoS (25%) to qualify for graduation to exact match */
    maxAcos: 0.25,
    /** Minimum conversions required */
    minConversions: 5,
    /** Minimum spend in dollars */
    minSpend: 50,
  },
  negative: {
    /** Minimum spend before suggesting negative keyword */
    minSpend: 25,
    /** Maximum orders (0 = no conversions) */
    maxOrders: 0,
    /** Minimum clicks for statistical significance */
    minClicks: 50,
  },
  budget: {
    /** Minimum ROAS to suggest budget increase */
    minRoas: 1.5,
    /** Budget utilization percentage threshold */
    budgetUtilization: 0.95,
  },
}

/**
 * Default number of days to snooze a recommendation
 */
export const DEFAULT_SNOOZE_DAYS = 7

/**
 * Maximum number of days a recommendation can be snoozed
 */
export const MAX_SNOOZE_DAYS = 30

// ============================================
// Helper Functions
// ============================================

/**
 * Merge brand-specific thresholds with defaults.
 * Brand settings override defaults for any specified values.
 *
 * @param brandSettings - Threshold overrides from Brand.settings
 * @param defaults - Default thresholds (optional, uses DEFAULT_THRESHOLDS)
 * @returns Complete thresholds object with all values
 */
export function mergeThresholds(
  brandSettings: RecommendationThresholds | undefined | null,
  defaults: RequiredThresholds = DEFAULT_THRESHOLDS
): RequiredThresholds {
  if (!brandSettings) {
    return defaults
  }

  return {
    graduation: {
      maxAcos: brandSettings.graduation?.maxAcos ?? defaults.graduation.maxAcos,
      minConversions: brandSettings.graduation?.minConversions ?? defaults.graduation.minConversions,
      minSpend: brandSettings.graduation?.minSpend ?? defaults.graduation.minSpend,
    },
    negative: {
      minSpend: brandSettings.negative?.minSpend ?? defaults.negative.minSpend,
      maxOrders: brandSettings.negative?.maxOrders ?? defaults.negative.maxOrders,
      minClicks: brandSettings.negative?.minClicks ?? defaults.negative.minClicks,
    },
    budget: {
      minRoas: brandSettings.budget?.minRoas ?? defaults.budget.minRoas,
      budgetUtilization: brandSettings.budget?.budgetUtilization ?? defaults.budget.budgetUtilization,
    },
  }
}

/**
 * Calculate the date when a snoozed recommendation should reappear.
 *
 * @param days - Number of days to snooze (default: 7)
 * @returns Date when the snooze period ends
 */
export function calculateSnoozedUntil(days: number = DEFAULT_SNOOZE_DAYS): Date {
  const snoozedUntil = new Date()
  snoozedUntil.setDate(snoozedUntil.getDate() + Math.min(days, MAX_SNOOZE_DAYS))
  return snoozedUntil
}

/**
 * Check if a recommendation should be considered expired based on snooze time.
 * A snoozed recommendation's snooze period has ended if snoozedUntil is in the past.
 *
 * @param recommendation - The recommendation to check
 * @returns true if the snooze period has expired and recommendation should return to PENDING
 */
export function isSnoozePeriodEnded(
  recommendation: Pick<Recommendation, 'status' | 'snoozedUntil'>
): boolean {
  if (recommendation.status !== 'SNOOZED' || !recommendation.snoozedUntil) {
    return false
  }

  return new Date(recommendation.snoozedUntil) <= new Date()
}

/**
 * Check if a recommendation is actionable (can be accepted/rejected/snoozed).
 * Only PENDING recommendations are actionable.
 *
 * @param recommendation - The recommendation to check
 * @returns true if the recommendation can have actions taken on it
 */
export function isRecommendationActionable(
  recommendation: Pick<Recommendation, 'status'>
): boolean {
  return recommendation.status === 'PENDING'
}

/**
 * Get a human-readable label for a recommendation type.
 *
 * @param type - The recommendation type
 * @returns Human-readable label
 */
export function getRecommendationTypeLabel(type: Recommendation['type']): string {
  const labels: Record<Recommendation['type'], string> = {
    KEYWORD_GRADUATION: 'Keyword Graduation',
    DUPLICATE_KEYWORD: 'Duplicate Keyword',
    NEGATIVE_KEYWORD: 'Negative Keyword',
    BUDGET_INCREASE: 'Budget Increase',
    BID_DECREASE: 'Bid Decrease',
  }
  return labels[type]
}

/**
 * Get a human-readable label for a recommendation status.
 *
 * @param status - The recommendation status
 * @returns Human-readable label
 */
export function getRecommendationStatusLabel(status: Recommendation['status']): string {
  const labels: Record<Recommendation['status'], string> = {
    PENDING: 'Pending',
    ACCEPTED: 'Accepted',
    REJECTED: 'Rejected',
    SNOOZED: 'Snoozed',
    EXPIRED: 'Expired',
  }
  return labels[status]
}

/**
 * Get a human-readable label for a confidence level.
 *
 * @param confidence - The confidence level
 * @returns Human-readable label
 */
export function getConfidenceLevelLabel(confidence: Recommendation['confidence']): string {
  const labels: Record<Recommendation['confidence'], string> = {
    HIGH: 'High Confidence',
    MEDIUM: 'Medium Confidence',
    LOW: 'Low Confidence',
  }
  return labels[confidence]
}

/**
 * Calculate the projected improvement percentage from expected impact.
 *
 * @param expectedImpact - The expected impact object
 * @returns Improvement percentage (positive = better, negative = worse)
 */
export function calculateImprovementPercentage(expectedImpact: {
  current: number
  projected: number
  metric?: string
}): number {
  if (expectedImpact.current === 0) {
    return 0
  }

  const change = expectedImpact.projected - expectedImpact.current
  const percentChange = (change / expectedImpact.current) * 100

  // For cost metrics like ACoS and spend, a decrease is an improvement
  const costMetrics = ['acos', 'spend', 'cpc']
  const isCostMetric = expectedImpact.metric
    ? costMetrics.includes(expectedImpact.metric.toLowerCase())
    : false

  return isCostMetric ? -percentChange : percentChange
}
