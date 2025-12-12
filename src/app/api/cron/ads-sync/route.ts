/**
 * POST /api/cron/ads-sync
 *
 * Scheduled endpoint for daily Amazon Ads sync.
 * Authenticated via CRON_SECRET header.
 */

import { NextRequest, NextResponse } from 'next/server'
import { syncAllActiveCredentials } from '@/services/amazon-ads/sync'

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const cronSecret = process.env.CRON_SECRET
    const providedSecret = request.headers.get('X-Cron-Secret')

    if (!cronSecret || cronSecret.length < 16) {
      console.error('CRON_SECRET not properly configured')
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

    // Trigger sync for all active credentials
    const result = await syncAllActiveCredentials()

    return NextResponse.json({
      syncsTriggered: result.syncsTriggered,
      credentials: result.credentials,
      errors: result.errors.length > 0 ? result.errors : undefined,
    })
  } catch (error) {
    console.error('Error in cron ads-sync:', error)
    return NextResponse.json(
      { error: 'Failed to trigger syncs' },
      { status: 500 }
    )
  }
}
