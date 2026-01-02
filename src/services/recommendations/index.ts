/**
 * Recommendation Engine Service Exports
 *
 * Barrel file for all recommendation service exports.
 */

// Keyword Graduation
export {
  classifyCampaign,
  isDiscoveryCampaign,
  isAccelerateCampaign,
  meetsGraduationThresholds,
  getGraduationEligibility,
  generateGraduationRecommendation,
  buildGraduationRationale,
  calculateGraduationImpact,
  type CampaignCategory,
  type KeywordMetricsAggregate,
  type GraduationEligibility,
  type GraduationRecommendation,
} from './keyword-graduation'

// Confidence Scoring
export {
  calculateConfidence,
  calculateDataQualityScore,
  getConfidenceDescription,
  hasMinimumDataQuality,
  CONFIDENCE_THRESHOLDS,
  type DataQualityMetrics,
} from './confidence-scoring'

// Generator
export {
  generateRecommendations,
  findGraduationCandidates,
  type GenerateRecommendationsOptions,
  type GenerateRecommendationsResult,
} from './generator'

// API Helpers
export {
  getRecommendationsForBrand,
  getRecommendationById,
  actionRecommendation,
  getRecommendationSummary,
  type ActionRecommendationParams,
  type ActionRecommendationResult,
} from './api-helpers'
