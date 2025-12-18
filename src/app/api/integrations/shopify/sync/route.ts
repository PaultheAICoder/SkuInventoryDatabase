/**
 * Shopify Sync API Route
 *
 * Triggers manual order sync from connected Shopify store.
 * POST /api/integrations/shopify/sync
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSelectedCompanyRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { syncAll } from '@/services/shopify/sync'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check selectedCompanyId BEFORE role check to return proper 400 error
    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return NextResponse.json(
        { error: 'No company selected. Please refresh the page and try again.' },
        { status: 400 }
      )
    }

    // Admin or Ops only (using company-specific role)
    const companyRole = getSelectedCompanyRole(session)
    if (companyRole !== 'admin' && companyRole !== 'ops') {
      return NextResponse.json(
        { error: 'Admin or Ops permission required' },
        { status: 403 }
      )
    }

    const companyId = selectedCompanyId

    // Get connection
    const connection = await prisma.shopifyConnection.findFirst({
      where: {
        companyId,
        isActive: true,
      },
    })

    if (!connection) {
      return NextResponse.json(
        { error: 'No Shopify store connected' },
        { status: 400 }
      )
    }

    // Check if sync is already running
    if (connection.syncStatus === 'syncing') {
      return NextResponse.json(
        { error: 'Sync already in progress' },
        { status: 409 }
      )
    }

    // Get date range from request body
    const body = await request.json().catch(() => ({})) as {
      dateRange?: { startDate: string; endDate: string }
    }

    // Start sync
    const result = await syncAll({
      connectionId: connection.id,
      dateRange: body.dateRange,
      triggeredById: session.user.id,
    })

    return NextResponse.json({
      success: result.success,
      ordersProcessed: result.ordersProcessed,
      ordersCreated: result.ordersCreated,
      ordersUpdated: result.ordersUpdated,
      ordersFailed: result.ordersFailed,
      salesDailyUpdated: result.salesDailyUpdated,
      durationMs: result.durationMs,
      errors: result.errors.slice(0, 5),
    })
  } catch (error) {
    console.error('Shopify sync error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
