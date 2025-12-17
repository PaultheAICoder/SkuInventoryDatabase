/**
 * POST /api/integrations/amazon-ads/sync
 *
 * Triggers manual sync for Amazon Ads data.
 * Admin or Ops only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSelectedCompanyRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { syncAll } from '@/services/amazon-ads/sync'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
    const { credentialId, syncType, dateRange } = body

    if (!credentialId) {
      return NextResponse.json(
        { error: 'credentialId is required' },
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

    if (credential.companyId !== session.user.selectedCompanyId) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    if (credential.integrationType !== 'amazon_ads') {
      return NextResponse.json(
        { error: 'Invalid credential type' },
        { status: 400 }
      )
    }

    if (credential.status !== 'active') {
      return NextResponse.json(
        { error: 'Credential is not active. Please reconnect.' },
        { status: 400 }
      )
    }

    // Start sync (runs in background after initial response)
    const syncPromise = syncAll({
      credentialId,
      syncType: syncType || 'full',
      dateRange,
      triggeredById: session.user.id,
    })

    // Wait briefly for sync to start and get syncLogId
    const result = await Promise.race([
      syncPromise,
      new Promise<null>(resolve => setTimeout(() => resolve(null), 100)),
    ])

    if (result) {
      // Sync completed quickly (unlikely for real API calls)
      return NextResponse.json({
        syncLogId: result.syncLogId,
        status: result.status,
        message: `Sync ${result.status}. Processed ${result.recordsProcessed} records.`,
      })
    }

    // Sync is running in background - find the sync log
    const recentLog = await prisma.syncLog.findFirst({
      where: {
        credentialId,
        triggeredById: session.user.id,
        status: 'started',
      },
      orderBy: { startedAt: 'desc' },
    })

    return NextResponse.json(
      {
        syncLogId: recentLog?.id,
        status: 'started',
        message: 'Sync initiated. Check sync log for progress.',
      },
      { status: 202 }
    )
  } catch (error) {
    console.error('Error triggering sync:', error)
    return NextResponse.json(
      { error: 'Failed to trigger sync' },
      { status: 500 }
    )
  }
}
