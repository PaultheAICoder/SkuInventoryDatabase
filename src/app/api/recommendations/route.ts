import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSelectedCompanyRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import {
  success,
  paginated,
  unauthorized,
  serverError,
  parseQuery,
  error,
} from '@/lib/api-response'
import {
  recommendationQuerySchema,
  type RecommendationWithRelations,
  type ExpectedImpact,
} from '@/types/recommendations'
import { generateRecommendations } from '@/services/recommendations'

// GET /api/recommendations - List recommendations with filtering and pagination
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const selectedBrandId = session.user.selectedBrandId
    if (!selectedBrandId) {
      return error('Please select a brand to view recommendations', 400)
    }

    const { searchParams } = new URL(request.url)

    // Build query params object for schema parsing
    const queryParamsObj = new URLSearchParams()
    queryParamsObj.set('brandId', selectedBrandId)

    // Copy other search params
    searchParams.forEach((value, key) => {
      if (key !== 'brandId') {
        queryParamsObj.set(key, value)
      }
    })

    const queryResult = parseQuery(queryParamsObj, recommendationQuerySchema)
    if (queryResult.error) return queryResult.error

    const { status, type, confidence, page, pageSize, sortBy, sortOrder } = queryResult.data

    // Build where clause with brand scoping
    const now = new Date()
    const where: Prisma.RecommendationWhereInput = {
      brandId: selectedBrandId,
      ...(type && { type }),
      ...(confidence && { confidence }),
    }

    // Handle status filter - include SNOOZED if snoozedUntil is past
    if (status) {
      if (status === 'SNOOZED') {
        // Only return snoozed where snoozedUntil is still in the future
        where.status = 'SNOOZED'
        where.snoozedUntil = { gt: now }
      } else if (status === 'PENDING') {
        // Include PENDING and expired SNOOZED (snoozedUntil is past)
        where.OR = [
          { status: 'PENDING' },
          {
            status: 'SNOOZED',
            snoozedUntil: { lte: now },
          },
        ]
      } else {
        where.status = status
      }
    }

    // Count total
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

    // Transform response
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

    return paginated(data, total, page, pageSize)
  } catch (err) {
    console.error('Error listing recommendations:', err)
    return serverError()
  }
}

// POST /api/recommendations - Trigger recommendation generation
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    // Non-viewer role required for generation
    const companyRole = getSelectedCompanyRole(session)
    if (companyRole === 'viewer') {
      return unauthorized('Insufficient permissions')
    }

    const selectedBrandId = session.user.selectedBrandId
    if (!selectedBrandId) {
      return error('Please select a brand to generate recommendations', 400)
    }

    // Parse optional body
    const body = await request.json().catch(() => ({}))
    const dryRun = body.dryRun === true
    const lookbackDays = typeof body.lookbackDays === 'number' ? body.lookbackDays : undefined

    const result = await generateRecommendations({
      brandId: selectedBrandId,
      lookbackDays,
      dryRun,
    })

    return success(result)
  } catch (err) {
    console.error('Error generating recommendations:', err)
    return serverError()
  }
}
