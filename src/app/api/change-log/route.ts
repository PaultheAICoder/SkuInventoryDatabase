import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { paginated, unauthorized, serverError, parseQuery, error } from '@/lib/api-response'
import { changeLogQuerySchema, type ChangeLogEntryWithRelations } from '@/types/recommendations'

// GET /api/change-log - List change log entries with filtering and pagination
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    // Require brand selection for scoping
    const selectedBrandId = session.user.selectedBrandId
    if (!selectedBrandId) {
      return error('Please select a brand to view the change log', 400, 'NoBrandSelected')
    }

    const { searchParams } = new URL(request.url)
    const queryResult = parseQuery(searchParams, changeLogQuerySchema)
    if (queryResult.error) return queryResult.error

    const { page, pageSize, action, type, keyword, startDate, endDate, recommendationId } =
      queryResult.data

    // Build where clause - filter by brand through recommendation relation
    const where: Prisma.ChangeLogEntryWhereInput = {
      recommendation: {
        brandId: selectedBrandId,
      },
      // Optional recommendationId filter
      ...(recommendationId && { recommendationId }),
      // Optional action filter
      ...(action && { action }),
      // Optional recommendation type filter (via relation)
      ...(type && {
        recommendation: {
          brandId: selectedBrandId,
          type,
        },
      }),
      // Optional keyword search on recommendation.keyword (case-insensitive)
      ...(keyword && {
        recommendation: {
          brandId: selectedBrandId,
          ...(type && { type }),
          keyword: { contains: keyword, mode: 'insensitive' },
        },
      }),
      // Optional date range filter on createdAt
      ...(startDate || endDate
        ? {
            createdAt: {
              ...(startDate && { gte: new Date(`${startDate}T00:00:00Z`) }),
              ...(endDate && { lte: new Date(`${endDate}T23:59:59Z`) }),
            },
          }
        : {}),
    }

    // Get total count
    const total = await prisma.changeLogEntry.count({ where })

    // Get entries with pagination and relations
    const entries = await prisma.changeLogEntry.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        recommendation: {
          select: {
            id: true,
            type: true,
            keyword: true,
            campaign: {
              select: { name: true },
            },
          },
        },
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    // Transform to ChangeLogEntryWithRelations
    const data: ChangeLogEntryWithRelations[] = entries.map((entry) => ({
      id: entry.id,
      recommendationId: entry.recommendationId,
      action: entry.action,
      reason: entry.reason,
      notes: entry.notes,
      beforeValues: entry.beforeValues as Record<string, unknown>,
      afterValues: entry.afterValues as Record<string, unknown> | null,
      userId: entry.userId,
      createdAt: entry.createdAt,
      recommendation: {
        id: entry.recommendation.id,
        type: entry.recommendation.type,
        keyword: entry.recommendation.keyword,
        campaign: entry.recommendation.campaign,
      },
      user: {
        id: entry.user.id,
        name: entry.user.name,
      },
    }))

    return paginated(data, total, page, pageSize)
  } catch (err) {
    console.error('Error listing change log entries:', err)
    return serverError()
  }
}
