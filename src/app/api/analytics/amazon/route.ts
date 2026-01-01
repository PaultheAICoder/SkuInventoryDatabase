/**
 * Amazon Analytics API Route
 *
 * GET /api/analytics/amazon - Query keyword metrics for Amazon analytics dashboard
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { format, subDays, parseISO } from 'date-fns'
import type { KeywordPerformanceData, KeywordMetricsResponse } from '@/types/amazon-analytics'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return NextResponse.json(
        { error: 'No company selected. Please select a company from the sidebar.' },
        { status: 400 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const brandId = searchParams.get('brandId')
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')
    const limitParam = searchParams.get('limit')
    const limit = limitParam ? parseInt(limitParam, 10) : 10

    // Get brands for this company
    const brands = await prisma.brand.findMany({
      where: { companyId: selectedCompanyId },
      select: { id: true, name: true },
    })
    const brandIds = brands.map((b) => b.id)

    // If brandId is specified, verify it belongs to user's company
    if (brandId && !brandIds.includes(brandId)) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    // Default to last 30 days if no date range specified
    const now = new Date()
    const startDate = startDateParam
      ? parseISO(startDateParam)
      : subDays(now, 30)
    const endDate = endDateParam ? parseISO(endDateParam) : now

    // Get all campaigns for the company's brands to filter keyword metrics
    const campaigns = await prisma.adCampaign.findMany({
      where: {
        portfolio: {
          credential: {
            companyId: selectedCompanyId,
            ...(brandId && { brandId }),
          },
        },
      },
      select: { id: true },
    })
    const campaignIds = campaigns.map((c) => c.id)

    // If no campaigns, return empty response
    if (campaignIds.length === 0) {
      const response: KeywordMetricsResponse = {
        keywords: [],
        dateRange: {
          startDate: format(startDate, 'yyyy-MM-dd'),
          endDate: format(endDate, 'yyyy-MM-dd'),
        },
        totals: {
          totalSpend: 0,
          totalSales: 0,
          totalImpressions: 0,
          totalClicks: 0,
          overallAcos: 0,
          overallRoas: 0,
        },
      }
      return NextResponse.json(response)
    }

    // Query keyword metrics grouped by keyword
    const keywordData = await prisma.keywordMetric.groupBy({
      by: ['keyword'],
      where: {
        date: { gte: startDate, lte: endDate },
        campaignId: { in: campaignIds },
      },
      _sum: {
        spend: true,
        sales: true,
        impressions: true,
        clicks: true,
        orders: true,
      },
      orderBy: {
        _sum: { spend: 'desc' },
      },
      take: limit,
    })

    // Transform to KeywordPerformanceData format
    const keywords: KeywordPerformanceData[] = keywordData.map((kw) => {
      const spend = Number(kw._sum.spend) || 0
      const sales = Number(kw._sum.sales) || 0
      const impressions = kw._sum.impressions || 0
      const clicks = kw._sum.clicks || 0
      const orders = kw._sum.orders || 0

      // Calculate ACOS (Advertising Cost of Sales) = spend / sales * 100
      const acos = sales > 0 ? (spend / sales) * 100 : 0

      // Calculate ROAS (Return on Ad Spend) = sales / spend
      const roas = spend > 0 ? sales / spend : 0

      return {
        keyword: kw.keyword,
        spend,
        sales,
        impressions,
        clicks,
        acos: Math.round(acos * 100) / 100,
        roas: Math.round(roas * 100) / 100,
        orders,
      }
    })

    // Calculate totals
    const totalSpend = keywords.reduce((sum, k) => sum + k.spend, 0)
    const totalSales = keywords.reduce((sum, k) => sum + k.sales, 0)
    const totalImpressions = keywords.reduce((sum, k) => sum + k.impressions, 0)
    const totalClicks = keywords.reduce((sum, k) => sum + k.clicks, 0)
    const overallAcos = totalSales > 0 ? (totalSpend / totalSales) * 100 : 0
    const overallRoas = totalSpend > 0 ? totalSales / totalSpend : 0

    const response: KeywordMetricsResponse = {
      keywords,
      dateRange: {
        startDate: format(startDate, 'yyyy-MM-dd'),
        endDate: format(endDate, 'yyyy-MM-dd'),
      },
      totals: {
        totalSpend: Math.round(totalSpend * 100) / 100,
        totalSales: Math.round(totalSales * 100) / 100,
        totalImpressions,
        totalClicks,
        overallAcos: Math.round(overallAcos * 100) / 100,
        overallRoas: Math.round(overallRoas * 100) / 100,
      },
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Amazon analytics query error:', error)
    return NextResponse.json(
      { error: 'Failed to query Amazon analytics' },
      { status: 500 }
    )
  }
}
