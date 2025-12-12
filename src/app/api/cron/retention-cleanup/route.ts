/**
 * POST /api/cron/retention-cleanup
 *
 * Scheduled endpoint for data retention cleanup.
 * Deletes old records per retention policy:
 * - KeywordMetric: 12 months
 * - SalesDaily: 12 months
 * - SyncLog: 12 months (completed), 24 months (failed)
 *
 * Authenticated via X-Cron-Secret header.
 */

import { NextRequest, NextResponse } from 'next/server'
import { runRetentionCleanup } from '@/services/retention'

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Verify cron secret
    const cronSecret = process.env.CRON_SECRET
    const providedSecret = request.headers.get('X-Cron-Secret')

    if (!cronSecret || cronSecret.length < 16) {
      console.error('[Retention Cleanup] CRON_SECRET not properly configured')
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

    console.log('[Retention Cleanup] Starting retention cleanup...')

    const result = await runRetentionCleanup()

    console.log(
      `[Retention Cleanup] Complete: ${result.totalDeleted} records deleted ` +
      `(KeywordMetric: ${result.keywordMetricsDeleted}, SalesDaily: ${result.salesDailyDeleted}, ` +
      `SyncLog: ${result.syncLogsDeleted}) in ${result.duration}ms`
    )

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Retention Cleanup] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
