/**
 * Recommendation Engine Types
 * Types for the MVP-2 Recommendation Engine feature
 */

import { z } from 'zod'

// ============================================
// Enums (match Prisma enums)
// ============================================

/**
 * Types of recommendations the engine can generate
 */
export type RecommendationType =
  | 'KEYWORD_GRADUATION'
  | 'DUPLICATE_KEYWORD'
  | 'NEGATIVE_KEYWORD'
  | 'BUDGET_INCREASE'
  | 'BID_DECREASE'

/**
 * Status of a recommendation in its lifecycle
 */
export type RecommendationStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'SNOOZED'
  | 'EXPIRED'

/**
 * Confidence level of a recommendation
 */
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW'

/**
 * Actions that can be taken on a recommendation
 */
export type ChangeLogAction = 'ACCEPTED' | 'REJECTED' | 'SNOOZED'

// ============================================
// Zod Schemas for Validation
// ============================================

export const recommendationTypeSchema = z.enum([
  'KEYWORD_GRADUATION',
  'DUPLICATE_KEYWORD',
  'NEGATIVE_KEYWORD',
  'BUDGET_INCREASE',
  'BID_DECREASE',
])

export const recommendationStatusSchema = z.enum([
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'SNOOZED',
  'EXPIRED',
])

export const confidenceLevelSchema = z.enum(['HIGH', 'MEDIUM', 'LOW'])

export const changeLogActionSchema = z.enum(['ACCEPTED', 'REJECTED', 'SNOOZED'])

// ============================================
// Core Interfaces
// ============================================

/**
 * Structure of the expectedImpact JSON field
 */
export interface ExpectedImpact {
  /** The metric being impacted (e.g., 'acos', 'roas', 'spend') */
  metric: string
  /** Current value of the metric */
  current: number
  /** Projected value after implementing recommendation */
  projected: number
}

export const expectedImpactSchema = z.object({
  metric: z.string(),
  current: z.number(),
  projected: z.number(),
})

/**
 * Recommendation thresholds stored in Brand.settings JSON
 */
export interface RecommendationThresholds {
  graduation?: {
    /** Maximum ACoS to qualify for graduation (default: 0.25 = 25%) */
    maxAcos?: number
    /** Minimum conversions required (default: 5) */
    minConversions?: number
    /** Minimum spend required in dollars (default: 50) */
    minSpend?: number
  }
  negative?: {
    /** Minimum spend before suggesting negative (default: 25) */
    minSpend?: number
    /** Maximum orders to qualify as poor performer (default: 0) */
    maxOrders?: number
    /** Minimum clicks required (default: 50) */
    minClicks?: number
  }
  budget?: {
    /** Minimum ROAS before suggesting budget increase (default: 1.5) */
    minRoas?: number
    /** Budget utilization threshold (default: 0.95 = 95%) */
    budgetUtilization?: number
  }
}

export const recommendationThresholdsSchema = z.object({
  graduation: z
    .object({
      maxAcos: z.number().optional(),
      minConversions: z.number().optional(),
      minSpend: z.number().optional(),
    })
    .optional(),
  negative: z
    .object({
      minSpend: z.number().optional(),
      maxOrders: z.number().optional(),
      minClicks: z.number().optional(),
    })
    .optional(),
  budget: z
    .object({
      minRoas: z.number().optional(),
      budgetUtilization: z.number().optional(),
    })
    .optional(),
})

/**
 * Recommendation entity interface (matches Prisma model)
 */
export interface Recommendation {
  id: string
  brandId: string
  type: RecommendationType
  status: RecommendationStatus
  confidence: ConfidenceLevel
  keyword: string | null
  keywordMetricId: string | null
  campaignId: string | null
  rationale: string
  expectedImpact: ExpectedImpact
  metadata: Record<string, unknown> | null
  generatedAt: Date
  snoozedUntil: Date | null
  createdAt: Date
  updatedAt: Date
}

/**
 * ChangeLogEntry entity interface (matches Prisma model)
 */
export interface ChangeLogEntry {
  id: string
  recommendationId: string
  action: ChangeLogAction
  reason: string | null
  notes: string | null
  beforeValues: Record<string, unknown>
  afterValues: Record<string, unknown> | null
  userId: string
  createdAt: Date
}

/**
 * WatchedKeyword entity interface (matches Prisma model)
 */
export interface WatchedKeyword {
  id: string
  userId: string
  keyword: string
  brandId: string
  addedAt: Date
}

// ============================================
// API Query/Filter Schemas
// ============================================

/**
 * Query parameters for listing recommendations
 */
export const recommendationQuerySchema = z.object({
  brandId: z.string().uuid(),
  status: recommendationStatusSchema.optional(),
  type: recommendationTypeSchema.optional(),
  confidence: confidenceLevelSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(['createdAt', 'generatedAt', 'confidence']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export type RecommendationQuery = z.infer<typeof recommendationQuerySchema>

/**
 * Request body for updating recommendation status
 */
export const updateRecommendationSchema = z.object({
  action: changeLogActionSchema,
  reason: z.string().optional(),
  notes: z.string().optional(),
  snoozeDays: z.number().int().positive().max(30).optional(),
})

export type UpdateRecommendationRequest = z.infer<typeof updateRecommendationSchema>

/**
 * Query parameters for listing change log entries
 */
export const changeLogQuerySchema = z.object({
  recommendationId: z.string().uuid().optional(),
  action: changeLogActionSchema.optional(),
  type: recommendationTypeSchema.optional(), // Filter by recommendation type
  keyword: z.string().optional(), // Text search on recommendation.keyword
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
})

export type ChangeLogQuery = z.infer<typeof changeLogQuerySchema>

/**
 * Request body for adding a watched keyword
 */
export const addWatchedKeywordSchema = z.object({
  keyword: z.string().min(1).max(500),
  brandId: z.string().uuid(),
})

export type AddWatchedKeywordRequest = z.infer<typeof addWatchedKeywordSchema>

/**
 * Query parameters for listing watched keywords
 */
export const watchedKeywordQuerySchema = z.object({
  brandId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
})

export type WatchedKeywordQuery = z.infer<typeof watchedKeywordQuerySchema>

// ============================================
// Response Types
// ============================================

/**
 * Recommendation with related entities for API responses
 */
export interface RecommendationWithRelations extends Recommendation {
  brand?: { id: string; name: string }
  keywordMetric?: { keyword: string; matchType: string } | null
  campaign?: { id: string; name: string } | null
  changeLogEntries?: ChangeLogEntry[]
}

/**
 * Summary statistics for recommendations dashboard
 */
export interface RecommendationSummary {
  total: number
  pending: number
  accepted: number
  rejected: number
  snoozed: number
  byType: Record<RecommendationType, number>
  byConfidence: Record<ConfidenceLevel, number>
}

// ============================================
// API Response Types
// ============================================

/**
 * Paginated list response for recommendations API
 */
export interface RecommendationListResponse {
  data: RecommendationWithRelations[]
  meta: {
    total: number
    page: number
    pageSize: number
    totalPages: number
  }
}

/**
 * API request for triggering recommendation generation
 */
export const generateRecommendationsRequestSchema = z.object({
  dryRun: z.boolean().optional(),
  lookbackDays: z.number().int().positive().optional(),
})

export type GenerateRecommendationsRequest = z.infer<typeof generateRecommendationsRequestSchema>

// ============================================
// Change Log API Types
// ============================================

/**
 * ChangeLogEntry with related recommendation and user data
 */
export interface ChangeLogEntryWithRelations extends ChangeLogEntry {
  recommendation: {
    id: string
    type: RecommendationType
    keyword: string | null
    campaign?: { name: string } | null
  }
  user: {
    id: string
    name: string
  }
}

/**
 * Paginated response for Change Log listing API
 */
export interface ChangeLogListResponse {
  data: ChangeLogEntryWithRelations[]
  meta: {
    total: number
    page: number
    pageSize: number
    totalPages: number
  }
}
