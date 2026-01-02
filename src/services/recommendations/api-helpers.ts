/**
 * Recommendation API Helpers
 * Helper functions for recommendation API routes.
 */

import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { calculateSnoozedUntil } from '@/lib/recommendation-utils'
import type {
  RecommendationQuery,
  RecommendationSummary,
  RecommendationType,
  ConfidenceLevel,
  RecommendationWithRelations,
  ExpectedImpact,
  ChangeLogAction,
} from '@/types/recommendations'

// ============================================
// Query Functions
// ============================================

/**
 * Get paginated recommendations for a brand with filters
 */
export async function getRecommendationsForBrand(
  brandId: string,
  filters: Omit<RecommendationQuery, 'brandId'>,
  pagination: { page: number; pageSize: number }
): Promise<{ data: RecommendationWithRelations[]; total: number }> {
  const { status, type, confidence, sortBy, sortOrder } = filters
  const { page, pageSize } = pagination

  const now = new Date()

  // Build where clause
  const where: Prisma.RecommendationWhereInput = {
    brandId,
    ...(type && { type }),
    ...(confidence && { confidence }),
  }

  // Handle status filter
  if (status) {
    if (status === 'SNOOZED') {
      where.status = 'SNOOZED'
      where.snoozedUntil = { gt: now }
    } else if (status === 'PENDING') {
      where.OR = [
        { status: 'PENDING' },
        { status: 'SNOOZED', snoozedUntil: { lte: now } },
      ]
    } else {
      where.status = status
    }
  }

  // Get total count
  const total = await prisma.recommendation.count({ where })

  // Determine sort field
  const orderByField = sortBy === 'confidence'
    ? 'confidence'
    : sortBy === 'generatedAt'
      ? 'generatedAt'
      : 'createdAt'

  // Fetch recommendations
  const recommendations = await prisma.recommendation.findMany({
    where,
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: { [orderByField]: sortOrder },
    include: {
      brand: { select: { id: true, name: true } },
      keywordMetric: { select: { keyword: true, matchType: true } },
      campaign: { select: { id: true, name: true } },
    },
  })

  // Transform to response type
  const data: RecommendationWithRelations[] = recommendations.map((rec) => ({
    id: rec.id,
    brandId: rec.brandId,
    type: rec.type,
    status: rec.status,
    confidence: rec.confidence,
    keyword: rec.keyword,
    keywordMetricId: rec.keywordMetricId,
    campaignId: rec.campaignId,
    rationale: rec.rationale,
    expectedImpact: rec.expectedImpact as unknown as ExpectedImpact,
    metadata: rec.metadata as Record<string, unknown> | null,
    generatedAt: rec.generatedAt,
    snoozedUntil: rec.snoozedUntil,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    brand: rec.brand,
    keywordMetric: rec.keywordMetric,
    campaign: rec.campaign,
  }))

  return { data, total }
}

/**
 * Get a single recommendation by ID with all relations
 */
export async function getRecommendationById(
  id: string,
  brandId: string
): Promise<RecommendationWithRelations | null> {
  const recommendation = await prisma.recommendation.findFirst({
    where: { id, brandId },
    include: {
      brand: { select: { id: true, name: true } },
      keywordMetric: { select: { keyword: true, matchType: true } },
      campaign: { select: { id: true, name: true } },
      changeLogEntries: {
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true } } },
      },
    },
  })

  if (!recommendation) return null

  return {
    id: recommendation.id,
    brandId: recommendation.brandId,
    type: recommendation.type,
    status: recommendation.status,
    confidence: recommendation.confidence,
    keyword: recommendation.keyword,
    keywordMetricId: recommendation.keywordMetricId,
    campaignId: recommendation.campaignId,
    rationale: recommendation.rationale,
    expectedImpact: recommendation.expectedImpact as unknown as ExpectedImpact,
    metadata: recommendation.metadata as Record<string, unknown> | null,
    generatedAt: recommendation.generatedAt,
    snoozedUntil: recommendation.snoozedUntil,
    createdAt: recommendation.createdAt,
    updatedAt: recommendation.updatedAt,
    brand: recommendation.brand,
    keywordMetric: recommendation.keywordMetric,
    campaign: recommendation.campaign,
    changeLogEntries: recommendation.changeLogEntries.map((entry) => ({
      id: entry.id,
      recommendationId: entry.recommendationId,
      action: entry.action,
      reason: entry.reason,
      notes: entry.notes,
      beforeValues: entry.beforeValues as Record<string, unknown>,
      afterValues: entry.afterValues as Record<string, unknown> | null,
      userId: entry.userId,
      createdAt: entry.createdAt,
    })),
  }
}

// ============================================
// Action Functions
// ============================================

export interface ActionRecommendationParams {
  id: string
  userId: string
  brandId: string
  action: ChangeLogAction
  reason?: string
  notes?: string
  snoozeDays?: number
}

export interface ActionRecommendationResult {
  success: boolean
  recommendation?: RecommendationWithRelations
  error?: string
}

/**
 * Action a recommendation (accept, reject, or snooze)
 */
export async function actionRecommendation(
  params: ActionRecommendationParams
): Promise<ActionRecommendationResult> {
  const { id, userId, brandId, action, reason, notes, snoozeDays } = params

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Get current recommendation
      const recommendation = await tx.recommendation.findFirst({
        where: { id, brandId },
      })

      if (!recommendation) {
        throw new Error('NOT_FOUND')
      }

      // Check if actionable
      const now = new Date()
      const isExpiredSnooze = recommendation.status === 'SNOOZED' &&
        recommendation.snoozedUntil &&
        recommendation.snoozedUntil <= now

      if (recommendation.status !== 'PENDING' && !isExpiredSnooze) {
        throw new Error('ALREADY_ACTIONED')
      }

      // Calculate snooze date if needed
      const snoozedUntil = action === 'SNOOZED'
        ? calculateSnoozedUntil(snoozeDays)
        : null

      // Update recommendation
      const updated = await tx.recommendation.update({
        where: { id },
        data: {
          status: action,
          snoozedUntil,
        },
        include: {
          brand: { select: { id: true, name: true } },
          keywordMetric: { select: { keyword: true, matchType: true } },
          campaign: { select: { id: true, name: true } },
        },
      })

      // Create change log entry
      await tx.changeLogEntry.create({
        data: {
          recommendationId: id,
          action,
          reason: reason || null,
          notes: notes || null,
          beforeValues: {
            status: recommendation.status,
            snoozedUntil: recommendation.snoozedUntil?.toISOString() || null,
          },
          afterValues: {
            status: action,
            snoozedUntil: snoozedUntil?.toISOString() || null,
          },
          userId,
        },
      })

      return updated
    })

    return {
      success: true,
      recommendation: {
        id: result.id,
        brandId: result.brandId,
        type: result.type,
        status: result.status,
        confidence: result.confidence,
        keyword: result.keyword,
        keywordMetricId: result.keywordMetricId,
        campaignId: result.campaignId,
        rationale: result.rationale,
        expectedImpact: result.expectedImpact as unknown as ExpectedImpact,
        metadata: result.metadata as Record<string, unknown> | null,
        generatedAt: result.generatedAt,
        snoozedUntil: result.snoozedUntil,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
        brand: result.brand,
        keywordMetric: result.keywordMetric,
        campaign: result.campaign,
      },
    }
  } catch (err) {
    if (err instanceof Error) {
      return { success: false, error: err.message }
    }
    return { success: false, error: 'Unknown error' }
  }
}

// ============================================
// Summary Functions
// ============================================

/**
 * Get recommendation summary stats for a brand
 */
export async function getRecommendationSummary(
  brandId: string
): Promise<RecommendationSummary> {
  // Run all counts in parallel
  const [
    total,
    pending,
    accepted,
    rejected,
    snoozed,
    keywordGraduation,
    duplicateKeyword,
    negativeKeyword,
    budgetIncrease,
    bidDecrease,
    highConfidence,
    mediumConfidence,
    lowConfidence,
  ] = await Promise.all([
    prisma.recommendation.count({ where: { brandId } }),
    prisma.recommendation.count({ where: { brandId, status: 'PENDING' } }),
    prisma.recommendation.count({ where: { brandId, status: 'ACCEPTED' } }),
    prisma.recommendation.count({ where: { brandId, status: 'REJECTED' } }),
    prisma.recommendation.count({ where: { brandId, status: 'SNOOZED' } }),
    prisma.recommendation.count({ where: { brandId, type: 'KEYWORD_GRADUATION' } }),
    prisma.recommendation.count({ where: { brandId, type: 'DUPLICATE_KEYWORD' } }),
    prisma.recommendation.count({ where: { brandId, type: 'NEGATIVE_KEYWORD' } }),
    prisma.recommendation.count({ where: { brandId, type: 'BUDGET_INCREASE' } }),
    prisma.recommendation.count({ where: { brandId, type: 'BID_DECREASE' } }),
    prisma.recommendation.count({ where: { brandId, confidence: 'HIGH' } }),
    prisma.recommendation.count({ where: { brandId, confidence: 'MEDIUM' } }),
    prisma.recommendation.count({ where: { brandId, confidence: 'LOW' } }),
  ])

  return {
    total,
    pending,
    accepted,
    rejected,
    snoozed,
    byType: {
      KEYWORD_GRADUATION: keywordGraduation,
      DUPLICATE_KEYWORD: duplicateKeyword,
      NEGATIVE_KEYWORD: negativeKeyword,
      BUDGET_INCREASE: budgetIncrease,
      BID_DECREASE: bidDecrease,
    } as Record<RecommendationType, number>,
    byConfidence: {
      HIGH: highConfidence,
      MEDIUM: mediumConfidence,
      LOW: lowConfidence,
    } as Record<ConfidenceLevel, number>,
  }
}
