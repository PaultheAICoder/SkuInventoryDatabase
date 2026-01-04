/**
 * POST /api/cron/recommendations
 *
 * Scheduled endpoint for weekly recommendation generation.
 * Authenticated via CRON_SECRET header.
 *
 * Intended schedule: Sunday 11 PM (for Monday morning availability)
 *
 * Configuration (via environment variables):
 * - DISABLE_RECOMMENDATION_SCHEDULER: Set to 'true' to disable
 * - RECOMMENDATION_SCHEDULER_DAY: Day of week (0=Sunday, default 0)
 * - RECOMMENDATION_LOOKBACK_DAYS: Days to analyze (default 30)
 */

import { NextRequest, NextResponse } from 'next/server'
import { runScheduledRecommendationGeneration } from '@/services/recommendations/scheduler'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

// Maximum execution time (5 minutes for processing multiple brands)
export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const cronSecret = process.env.CRON_SECRET
    const providedSecret = request.headers.get('X-Cron-Secret')

    if (!cronSecret || cronSecret.length < 16) {
      console.error('[Recommendation Cron] CRON_SECRET not properly configured')
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

    // Check for force flag (for manual triggering regardless of day)
    const { searchParams } = new URL(request.url)
    const force = searchParams.get('force') === 'true'

    // Run scheduled generation
    const result = await runScheduledRecommendationGeneration(force)

    // Check if skipped
    if (result.skipped) {
      return NextResponse.json({
        success: true,
        skipped: result.skipped,
        message: result.skipped === 'disabled'
          ? 'Recommendation scheduler is disabled via DISABLE_RECOMMENDATION_SCHEDULER'
          : 'Recommendation scheduler skipped (not configured day of week)',
        duration: result.duration,
      })
    }

    return NextResponse.json({
      success: true,
      totalBrands: result.totalBrands,
      brandsProcessed: result.brandsProcessed,
      brandsFailed: result.brandsFailed,
      results: result.results,
      duration: result.duration,
    })
  } catch (error) {
    console.error('[Recommendation Cron] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to run recommendation generation',
      },
      { status: 500 }
    )
  }
}
