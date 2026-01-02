/**
 * Confidence Scoring Service
 *
 * Calculates confidence levels for recommendations based on data quality metrics.
 * More data (days, impressions) leads to higher confidence in recommendations.
 */

import type { ConfidenceLevel } from '@/types/recommendations'

// ============================================
// Types
// ============================================

/**
 * Data quality metrics for confidence calculation
 */
export interface DataQualityMetrics {
  dataPoints: number          // Number of days with data
  impressions: number         // Total impressions (sample size)
  conversionVariance?: number // Optional: variance in daily conversions
  daysSpan: number           // Days between first and last data point
}

// ============================================
// Constants
// ============================================

/**
 * Confidence thresholds for documentation and configuration
 */
export const CONFIDENCE_THRESHOLDS = {
  HIGH: { minDays: 30, minImpressions: 1000 },
  MEDIUM: { minDays: 14, minImpressions: 500 },
  LOW: { minDays: 0, minImpressions: 0 },
} as const

// ============================================
// Functions
// ============================================

/**
 * Calculate confidence level based on data volume and consistency
 *
 * HIGH: 30+ days of data, 1000+ impressions
 * MEDIUM: 14-29 days of data, 500+ impressions
 * LOW: <14 days or <500 impressions
 */
export function calculateConfidence(metrics: DataQualityMetrics): ConfidenceLevel {
  const { dataPoints, impressions } = metrics

  // Check for HIGH confidence
  if (
    dataPoints >= CONFIDENCE_THRESHOLDS.HIGH.minDays &&
    impressions >= CONFIDENCE_THRESHOLDS.HIGH.minImpressions
  ) {
    return 'HIGH'
  }

  // Check for MEDIUM confidence
  if (
    dataPoints >= CONFIDENCE_THRESHOLDS.MEDIUM.minDays &&
    impressions >= CONFIDENCE_THRESHOLDS.MEDIUM.minImpressions
  ) {
    return 'MEDIUM'
  }

  // Default to LOW confidence
  return 'LOW'
}

/**
 * Calculate data quality score (0-100) for more granular assessment
 *
 * Score is based on:
 * - Days of data (0-50 points): Linear scale up to 30 days
 * - Impressions (0-50 points): Logarithmic scale, 1000+ = max
 */
export function calculateDataQualityScore(metrics: DataQualityMetrics): number {
  const { dataPoints, impressions } = metrics

  // Days component (0-50 points)
  // 30 days = 50 points, scales linearly
  const maxDays = CONFIDENCE_THRESHOLDS.HIGH.minDays
  const daysScore = Math.min(50, (dataPoints / maxDays) * 50)

  // Impressions component (0-50 points)
  // Using logarithmic scale: 1000+ impressions = 50 points
  // log10(1) = 0, log10(10) = 1, log10(100) = 2, log10(1000) = 3
  const maxImpressionsLog = Math.log10(CONFIDENCE_THRESHOLDS.HIGH.minImpressions) // 3
  let impressionsScore = 0
  if (impressions > 0) {
    const impressionsLog = Math.log10(impressions)
    impressionsScore = Math.min(50, (impressionsLog / maxImpressionsLog) * 50)
  }

  // Total score (0-100)
  const totalScore = daysScore + impressionsScore

  // Round to nearest integer
  return Math.round(totalScore)
}

/**
 * Get human-readable confidence description
 */
export function getConfidenceDescription(confidence: ConfidenceLevel): string {
  switch (confidence) {
    case 'HIGH':
      return 'Based on 30+ days of data with significant volume. High reliability.'
    case 'MEDIUM':
      return 'Based on 14-29 days of data with moderate volume. Good reliability.'
    case 'LOW':
      return 'Based on limited data. Consider gathering more data before acting.'
  }
}

/**
 * Check if data quality is sufficient for recommendation
 */
export function hasMinimumDataQuality(metrics: DataQualityMetrics): boolean {
  // Minimum: at least 7 days with at least 100 impressions
  return metrics.dataPoints >= 7 && metrics.impressions >= 100
}
