/**
 * POST /api/integrations/amazon-ads/reports
 *
 * Triggers search term report sync for Amazon Ads.
 * Admin or Ops only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSelectedCompanyRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getProfiles } from '@/services/amazon-ads/client'
import { syncSearchTermReport } from '@/services/amazon-ads/reports'

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
    const { credentialId, startDate, endDate } = body

    if (!credentialId) {
      return NextResponse.json(
        { error: 'credentialId is required' },
        { status: 400 }
      )
    }

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required (YYYY-MM-DD format)' },
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

    // Get profile ID
    const profilesResult = await getProfiles(credentialId)
    if (!profilesResult.success || !profilesResult.data || profilesResult.data.length === 0) {
      return NextResponse.json(
        { error: 'No advertising profiles found' },
        { status: 400 }
      )
    }

    // Use US marketplace profile
    const profile = profilesResult.data.find(p => p.countryCode === 'US') || profilesResult.data[0]
    const profileId = profile.profileId.toString()

    // Start sync (runs in background after initial response)
    const syncPromise = syncSearchTermReport({
      credentialId,
      profileId,
      dateRange: { startDate, endDate },
      triggeredById: session.user.id,
    })

    // Wait briefly for sync to start
    const result = await Promise.race([
      syncPromise,
      new Promise<null>(resolve => setTimeout(() => resolve(null), 100)),
    ])

    if (result) {
      return NextResponse.json({
        syncLogId: result.syncLogId,
        reportId: result.reportId,
        status: result.status,
        message: `Report sync ${result.status}. Processed ${result.recordsProcessed} records.`,
      })
    }

    // Sync is running in background
    const recentLog = await prisma.syncLog.findFirst({
      where: {
        credentialId,
        triggeredById: session.user.id,
        status: 'running',
      },
      orderBy: { startedAt: 'desc' },
    })

    return NextResponse.json(
      {
        syncLogId: recentLog?.id,
        status: 'started',
        message: 'Report sync initiated. Check sync log for progress.',
      },
      { status: 202 }
    )
  } catch (error) {
    console.error('Error triggering report sync:', error)
    return NextResponse.json(
      { error: 'Failed to trigger report sync' },
      { status: 500 }
    )
  }
}
