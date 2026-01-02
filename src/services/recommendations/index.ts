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

// Duplicate Keyword Detection
export {
  findDuplicateKeywords,
  generateDuplicateRecommendation,
  buildDuplicateRationale,
  calculateDuplicateImpact,
  type DuplicateKeywordGroup,
  type CampaignOccurrence,
  type DuplicateRecommendation,
} from './duplicate-detection'

// Negative Keyword Suggestions
export {
  findNegativeKeywords,
  meetsNegativeThresholds,
  generateNegativeRecommendation,
  buildNegativeRationale,
  calculateNegativeImpact,
  type NegativeKeywordCandidate,
  type NegativeRecommendation,
} from './negative-suggestions'

// Budget and Bid Strategy
export {
  findBudgetIncreaseCandidates,
  findBidDecreaseCandidates,
  generateBudgetRecommendation,
  generateBidDecreaseRecommendation,
  buildBudgetIncreaseRationale,
  buildBidDecreaseRationale,
  calculateBudgetImpact,
  calculateBidImpact,
  type CampaignMetricsAggregate,
  type BudgetIncreaseCandidate,
  type BidDecreaseCandidate,
  type BudgetRecommendation,
  type BidDecreaseRecommendation,
} from './budget-strategy'

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
