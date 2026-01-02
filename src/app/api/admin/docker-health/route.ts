import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getMonitorConfig,
  updateMonitorConfig,
  getHealthLogs,
  getContainerEvents,
  getContainerStatusSummary,
} from '@/services/container-health'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

// Container names to monitor (configurable via environment)
// Default: inventory-app,inventory-db-prod for production
// Test: Set DOCKER_MONITOR_CONTAINERS=inventory-app-test,inventory-db-test
function getMonitoredContainers(): string[] {
  const envContainers = process.env.DOCKER_MONITOR_CONTAINERS
  if (envContainers) {
    return envContainers.split(',').map(c => c.trim()).filter(Boolean)
  }
  // Default containers for production
  return ['inventory-app', 'inventory-db-prod']
}

const MONITORED_CONTAINERS = getMonitoredContainers()

/**
 * GET /api/admin/docker-health - Get dashboard data
 * Requires admin role
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const daysBack = parseInt(searchParams.get('daysBack') ?? '7', 10)

    const [config, containers, recentEvents, healthHistory] = await Promise.all([
      getMonitorConfig(),
      getContainerStatusSummary(MONITORED_CONTAINERS),
      getContainerEvents(undefined, 50, daysBack),
      getHealthLogs(undefined, 100, daysBack),
    ])

    return NextResponse.json({
      data: {
        containers,
        config,
        recentEvents,
        healthHistory,
      },
    })
  } catch (error) {
    console.error('[Docker Health] GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/admin/docker-health - Update monitor configuration
 * Requires admin role
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()

    const config = await updateMonitorConfig({
      enableMonitoring: body.enableMonitoring,
      pollingIntervalSec: body.pollingIntervalSec,
      maxRestartAttempts: body.maxRestartAttempts,
      alertEmailAddresses: body.alertEmailAddresses,
      slackWebhookUrl: body.slackWebhookUrl,
      enableEmailAlerts: body.enableEmailAlerts,
      enableSlackAlerts: body.enableSlackAlerts,
    })

    return NextResponse.json({ data: { config } })
  } catch (error) {
    console.error('[Docker Health] PATCH error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
