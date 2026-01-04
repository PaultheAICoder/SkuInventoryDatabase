/**
 * POST /api/cron/shopify-sync
 *
 * Scheduled endpoint for daily Shopify order sync.
 * Authenticated via CRON_SECRET header.
 *
 * Syncs all active Shopify connections.
 *
 * Configuration (via environment variables):
 * - DISABLE_SHOPIFY_SYNC: Set to 'true' to disable
 * - SKIP_SHOPIFY_WEEKENDS: Set to 'true' to skip Saturday/Sunday
 * - SHOPIFY_SYNC_STAGGER_MS: Delay between connections (default 3000)
 * - SHOPIFY_SYNC_MAX_RETRIES: Max retry attempts (default 3)
 */

import { NextRequest, NextResponse } from 'next/server'
import { runScheduledShopifySync } from '@/services/shopify/scheduler'

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
      console.error('[Shopify Sync Cron] CRON_SECRET not properly configured')
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
    const result = await runScheduledShopifySync()

    // Check if skipped
    if (result.skipped) {
      return NextResponse.json({
        success: true,
        skipped: result.skipped,
        message: result.skipped === 'disabled'
          ? 'Shopify sync is disabled via DISABLE_SHOPIFY_SYNC'
          : 'Shopify sync skipped on weekend (SKIP_SHOPIFY_WEEKENDS=true)',
        duration: result.duration,
      })
    }

    return NextResponse.json({
      success: true,
      totalConnections: result.totalConnections,
      syncsTriggered: result.syncsTriggered,
      syncsCompleted: result.syncsCompleted,
      syncsFailed: result.syncsFailed,
      results: result.results.map(r => ({
        connectionId: r.connectionId,
        shopName: r.shopName,
        status: r.status,
        ordersProcessed: r.ordersProcessed,
        ordersCreated: r.ordersCreated,
        ordersUpdated: r.ordersUpdated,
        error: r.error,
        retries: r.retryCount,
      })),
      duration: result.duration,
    })
  } catch (error) {
    console.error('[Shopify Sync Cron] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to run Shopify sync',
      },
      { status: 500 }
    )
  }
}
