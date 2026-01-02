import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSelectedCompanyRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  success,
  unauthorized,
  notFound,
  serverError,
  parseBody,
  error,
} from '@/lib/api-response'
import {
  updateRecommendationSchema,
  type RecommendationWithRelations,
  type ExpectedImpact,
  type ChangeLogEntry,
} from '@/types/recommendations'
import { calculateSnoozedUntil } from '@/lib/recommendation-utils'

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/recommendations/:id - Get recommendation details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { id } = await params
    const selectedBrandId = session.user.selectedBrandId

    if (!selectedBrandId) {
      return error('Please select a brand to view recommendations', 400)
    }

    const recommendation = await prisma.recommendation.findFirst({
      where: {
        id,
        brandId: selectedBrandId,
      },
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

    if (!recommendation) {
      return notFound('Recommendation')
    }

    // Transform response
    const result: RecommendationWithRelations = {
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
        user: entry.user,
      })) as (ChangeLogEntry & { user?: { id: string; name: string } })[],
    }

    return success(result)
  } catch (err) {
    console.error('Error getting recommendation:', err)
    return serverError()
  }
}

// PATCH /api/recommendations/:id - Accept, reject, or snooze a recommendation
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    // Non-viewer role required for actions
    const companyRole = getSelectedCompanyRole(session)
    if (companyRole === 'viewer') {
      return unauthorized('Insufficient permissions')
    }

    const { id } = await params
    const selectedBrandId = session.user.selectedBrandId

    if (!selectedBrandId) {
      return error('Please select a brand to action recommendations', 400)
    }

    const bodyResult = await parseBody(request, updateRecommendationSchema)
    if (bodyResult.error) return bodyResult.error

    const { action, reason, notes, snoozeDays } = bodyResult.data

    // Validate rejection requires reason
    if (action === 'REJECTED' && !reason) {
      return error('Reason is required when rejecting a recommendation', 400)
    }

    // Use transaction for atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Get current recommendation
      const recommendation = await tx.recommendation.findFirst({
        where: {
          id,
          brandId: selectedBrandId,
        },
      })

      if (!recommendation) {
        throw new Error('NOT_FOUND')
      }

      // Only PENDING recommendations can be actioned
      // Also allow SNOOZED recommendations that have expired
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
          userId: session.user.id,
        },
      })

      return updated
    })

    // Transform response
    const response: RecommendationWithRelations = {
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
    }

    return success(response)
  } catch (err) {
    if (err instanceof Error) {
      switch (err.message) {
        case 'NOT_FOUND':
          return notFound('Recommendation')
        case 'ALREADY_ACTIONED':
          return error('This recommendation has already been actioned', 400)
      }
    }
    console.error('Error updating recommendation:', err)
    return serverError()
  }
}
