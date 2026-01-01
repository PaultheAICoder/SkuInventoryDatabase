/**
 * POST /api/cron/ads-sync
 *
 * Scheduled endpoint for daily Amazon data sync (Ads + Orders).
 * Authenticated via CRON_SECRET header.
 *
 * Syncs:
 * - All active amazon_ads credentials (portfolios, campaigns, reports)
 * - All active amazon_sp credentials (orders to SalesDaily)
 *
 * Configuration (via environment variables):
 * - DISABLE_AMAZON_SYNC: Set to 'true' to disable
 * - SKIP_WEEKENDS: Set to 'true' to skip Saturday/Sunday
 * - SYNC_STAGGER_MS: Delay between credentials (default 5000)
 * - SYNC_MAX_RETRIES: Max retry attempts (default 3)
 */

import { NextRequest, NextResponse } from 'next/server'
import { runScheduledAmazonSync } from '@/services/amazon-sync/scheduler'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

// Maximum execution time (10 minutes for large syncs)
export const maxDuration = 600

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const cronSecret = process.env.CRON_SECRET
    const providedSecret = request.headers.get('X-Cron-Secret')

    if (!cronSecret || cronSecret.length < 16) {
      console.error('[Amazon Sync Cron] CRON_SECRET not properly configured')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    if (providedSecret !== cronSecret) {
      return NextResponse.json(
        { error: 'Invalid cron secret' },
        { status: 401 }
      )
    }

    // Run scheduled sync
    const result = await runScheduledAmazonSync()

    // Check if skipped
    if (result.skipped) {
      return NextResponse.json({
        success: true,
        skipped: result.skipped,
        message: result.skipped === 'disabled'
          ? 'Amazon sync is disabled via DISABLE_AMAZON_SYNC'
          : 'Amazon sync skipped on weekend (SKIP_WEEKENDS=true)',
        duration: result.duration,
      })
    }

    return NextResponse.json({
      success: true,
      totalCredentials: result.totalCredentials,
      syncsTriggered: result.syncsTriggered,
      syncsCompleted: result.syncsCompleted,
      syncsFailed: result.syncsFailed,
      amazonAdsResults: result.amazonAdsResults.map(r => ({
        credentialId: r.credentialId,
        status: r.status,
        syncLogId: r.syncLogId,
        error: r.error,
        retries: r.retryCount,
      })),
      amazonSpResults: result.amazonSpResults.map(r => ({
        credentialId: r.credentialId,
        status: r.status,
        syncLogId: r.syncLogId,
        error: r.error,
        retries: r.retryCount,
      })),
      duration: result.duration,
    })
  } catch (error) {
    console.error('[Amazon Sync Cron] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to run Amazon sync',
      },
      { status: 500 }
    )
  }
}
