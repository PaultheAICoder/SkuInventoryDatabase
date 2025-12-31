/**
 * POST /api/integrations/amazon-sp/orders
 *
 * Triggers manual sync of Amazon orders to SalesDaily.
 * Admin or Ops only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSelectedCompanyRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { syncOrders } from '@/services/amazon-sp-api/sync-orders'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check selectedCompanyId BEFORE role check
    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return NextResponse.json(
        { error: 'No company selected. Please refresh the page and try again.' },
        { status: 400 }
      )
    }

    // Admin or Ops only
    const companyRole = getSelectedCompanyRole(session)
    if (companyRole !== 'admin' && companyRole !== 'ops') {
      return NextResponse.json(
        { error: 'Admin or Ops permission required' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { credentialId, brandId, startDate, endDate } = body as {
      credentialId: string
      brandId: string
      startDate: string  // YYYY-MM-DD
      endDate: string    // YYYY-MM-DD
    }

    // Validate required fields
    if (!credentialId || !brandId || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'credentialId, brandId, startDate, and endDate are required' },
        { status: 400 }
      )
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return NextResponse.json(
        { error: 'Dates must be in YYYY-MM-DD format' },
        { status: 400 }
      )
    }

    // Verify credential exists and belongs to user's company
    const credential = await prisma.integrationCredential.findUnique({
      where: { id: credentialId },
    })

    if (!credential) {
      return NextResponse.json(
        { error: 'Credential not found' },
        { status: 404 }
      )
    }

    if (credential.companyId !== selectedCompanyId) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    if (credential.integrationType !== 'amazon_sp') {
      return NextResponse.json(
        { error: 'Invalid credential type. Must be amazon_sp.' },
        { status: 400 }
      )
    }

    if (credential.status !== 'active') {
      return NextResponse.json(
        { error: 'Credential is not active. Please reconnect.' },
        { status: 400 }
      )
    }

    // Verify brand belongs to company
    const brand = await prisma.brand.findFirst({
      where: { id: brandId, companyId: selectedCompanyId },
    })

    if (!brand) {
      return NextResponse.json(
        { error: 'Brand not found' },
        { status: 404 }
      )
    }

    // Start sync (can be long-running)
    const result = await syncOrders({
      credentialId,
      brandId,
      dateRange: { startDate, endDate },
      triggeredById: session.user.id,
    })

    return NextResponse.json({
      syncLogId: result.syncLogId,
      status: result.status,
      ordersProcessed: result.ordersProcessed,
      orderItemsProcessed: result.orderItemsProcessed,
      salesDailyUpdated: result.salesDailyUpdated,
      errors: result.errors.slice(0, 10),  // Limit errors returned
      duration: result.duration,
      message: result.status === 'completed'
        ? `Successfully synced ${result.ordersProcessed} orders, updated ${result.salesDailyUpdated} daily records.`
        : `Sync ${result.status}. Processed ${result.ordersProcessed} orders with ${result.errors.length} errors.`,
    })

  } catch (error) {
    console.error('Error triggering Amazon orders sync:', error)
    return NextResponse.json(
      { error: 'Failed to trigger orders sync' },
      { status: 500 }
    )
  }
}
