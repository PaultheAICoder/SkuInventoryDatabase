/**
 * Sales Daily API Route
 *
 * GET /api/sales-daily - Query daily sales by brand, ASIN, date range with organic percentage
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { error } from '@/lib/api-response'
import { Prisma } from '@prisma/client'
import { calculateOrganicPercentage } from '@/services/sales-daily/calculator'
import { format, subDays, parseISO, startOfDay, endOfDay } from 'date-fns'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const brandId = searchParams.get('brandId')
    const asin = searchParams.get('asin')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const _groupBy = searchParams.get('groupBy') || 'day' // day, week, month - reserved for future aggregation
    const channel = searchParams.get('channel') // amazon, shopify, or null for all

    // Use selected company from session
    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return error('No company selected. Please select a company from the sidebar.', 400)
    }

    // Get brands for this company
    const brands = await prisma.brand.findMany({
      where: { companyId: selectedCompanyId },
      select: { id: true, name: true },
    })
    const brandIds = brands.map(b => b.id)

    // If brandId is specified, verify it belongs to user's company
    if (brandId && !brandIds.includes(brandId)) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    // Default to last 30 days if no date range specified
    const now = new Date()
    const effectiveStartDate = startDate || format(subDays(now, 30), 'yyyy-MM-dd')
    const effectiveEndDate = endDate || format(now, 'yyyy-MM-dd')

    // Build where clause
    const where: Prisma.SalesDailyWhereInput = {
      brandId: brandId ? brandId : { in: brandIds },
      date: {
        gte: startOfDay(parseISO(effectiveStartDate)),
        lte: endOfDay(parseISO(effectiveEndDate)),
      },
      ...(asin && { asin }),
      ...(channel && { channel }),
    }

    // Get sales data
    const salesData = await prisma.salesDaily.findMany({
      where,
      include: {
        brand: { select: { id: true, name: true } },
      },
      orderBy: { date: 'asc' },
    })

    // Calculate totals
    let totalSales = 0
    let totalAdAttributed = 0
    let totalOrganic = 0
    let totalOrders = 0

    // Group by date (can extend to week/month later)
    const dailyData = new Map<string, {
      date: string
      totalSales: number
      adAttributedSales: number
      organicSales: number
      orderCount: number
      channels: Set<string>
    }>()

    for (const record of salesData) {
      const dateKey = format(record.date, 'yyyy-MM-dd')
      const current = dailyData.get(dateKey) || {
        date: dateKey,
        totalSales: 0,
        adAttributedSales: 0,
        organicSales: 0,
        orderCount: 0,
        channels: new Set<string>(),
      }

      const recordTotal = Number(record.totalSales)
      const recordAdAttributed = Number(record.adAttributedSales)
      const recordOrganic = Number(record.organicSales)
      const recordOrders = record.unitsTotal || 0

      current.totalSales += recordTotal
      current.adAttributedSales += recordAdAttributed
      current.organicSales += recordOrganic
      current.orderCount += recordOrders
      current.channels.add(record.channel)

      dailyData.set(dateKey, current)

      // Update totals
      totalSales += recordTotal
      totalAdAttributed += recordAdAttributed
      totalOrganic += recordOrganic
      totalOrders += recordOrders
    }

    // Convert to array with organic percentage
    const entries = Array.from(dailyData.entries())
    const dailySummary = entries.map(([, data]) => ({
      date: data.date,
      totalSales: data.totalSales,
      adAttributedSales: data.adAttributedSales,
      organicSales: data.organicSales,
      organicPercentage: calculateOrganicPercentage(data.totalSales, data.organicSales),
      orderCount: data.orderCount,
      channels: Array.from(data.channels),
    }))

    // Calculate overall organic percentage
    const overallOrganicPercentage = calculateOrganicPercentage(totalSales, totalOrganic)

    return NextResponse.json({
      summary: {
        totalSales,
        adAttributedSales: totalAdAttributed,
        organicSales: totalOrganic,
        organicPercentage: overallOrganicPercentage,
        totalOrders,
        dateRange: {
          startDate: effectiveStartDate,
          endDate: effectiveEndDate,
        },
      },
      daily: dailySummary,
      brands: brandId
        ? brands.filter(b => b.id === brandId)
        : brands,
    })
  } catch (error) {
    console.error('Sales daily query error:', error)
    return NextResponse.json(
      { error: 'Failed to query daily sales' },
      { status: 500 }
    )
  }
}
