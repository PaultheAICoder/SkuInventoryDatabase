import { NextRequest, NextResponse } from 'next/server'
import { runAllCompanyAlerts } from '@/services/lowstock-alert'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

// Maximum execution time (for Vercel)
export const maxDuration = 60

/**
 * GET /api/cron/alerts - Run alert evaluation for all companies
 * Protected by Bearer token authentication
 *
 * Called by external cron service (Vercel Cron, Railway, crontab, etc.)
 *
 * Headers:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Query params:
 *   baseUrl: Optional base URL for component links (defaults to request origin)
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now()

  // Check if CRON_SECRET is configured
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.warn('[Cron] CRON_SECRET not configured')
    return NextResponse.json(
      { error: 'Cron endpoint not configured' },
      { status: 503 }
    )
  }

  // Verify Bearer token
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Missing authorization header' },
      { status: 401 }
    )
  }

  const token = authHeader.slice(7) // Remove 'Bearer '
  if (token !== cronSecret) {
    console.warn('[Cron] Invalid cron secret provided')
    return NextResponse.json(
      { error: 'Invalid authorization' },
      { status: 401 }
    )
  }

  // Get base URL for component links
  const searchParams = request.nextUrl.searchParams
  let baseUrl = searchParams.get('baseUrl')
  if (!baseUrl) {
    // Derive from request headers
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
    const proto = request.headers.get('x-forwarded-proto') || 'https'
    baseUrl = host ? `${proto}://${host}` : 'http://localhost:4545'
  }

  try {
    console.log(`[Cron] Alert evaluation started, baseUrl: ${baseUrl}`)

    const results = await runAllCompanyAlerts(baseUrl)

    const duration = Date.now() - startTime

    return NextResponse.json({
      success: true,
      duration: `${duration}ms`,
      ...results,
    })
  } catch (error) {
    console.error('[Cron] Alert evaluation failed:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: `${Date.now() - startTime}ms`,
      },
      { status: 500 }
    )
  }
}
