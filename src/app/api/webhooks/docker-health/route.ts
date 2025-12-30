import { NextRequest, NextResponse } from 'next/server'
import {
  recordHealthLog,
  recordContainerEvent,
} from '@/services/container-health'
import { sendContainerAlert, type ContainerAlertData } from '@/services/container-health-alert'
import type { ContainerStatus, ContainerEventType } from '@/types/container-health'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

/**
 * POST /api/webhooks/docker-health - Record health data from monitor
 * Protected by Bearer token (CRON_SECRET)
 *
 * Body types:
 * - { type: 'health_log', ... } - Record health check
 * - { type: 'event', ... } - Record container event
 * - { type: 'alert', ... } - Send alert notification
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  // Check if CRON_SECRET is configured
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.warn('[Docker Health Webhook] CRON_SECRET not configured')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
  }

  // Verify Bearer token
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing authorization header' }, { status: 401 })
  }

  const token = authHeader.slice(7)
  if (token !== cronSecret) {
    console.warn('[Docker Health Webhook] Invalid secret provided')
    return NextResponse.json({ error: 'Invalid authorization' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { type } = body

    if (type === 'health_log') {
      const log = await recordHealthLog({
        containerName: body.containerName,
        containerId: body.containerId,
        status: body.status as ContainerStatus,
        exitCode: body.exitCode,
        cpuPercent: body.cpuPercent,
        memoryUsageMb: body.memoryUsageMb,
        memoryLimitMb: body.memoryLimitMb,
        healthOutput: body.healthOutput,
      })

      return NextResponse.json({
        success: true,
        type: 'health_log',
        id: log.id,
        duration: `${Date.now() - startTime}ms`,
      })
    }

    if (type === 'event') {
      const event = await recordContainerEvent({
        containerName: body.containerName,
        containerId: body.containerId,
        eventType: body.eventType as ContainerEventType,
        exitCode: body.exitCode,
        details: body.details,
        logSnapshot: body.logSnapshot,
      })

      return NextResponse.json({
        success: true,
        type: 'event',
        id: event.id,
        duration: `${Date.now() - startTime}ms`,
      })
    }

    if (type === 'alert') {
      const alertData: ContainerAlertData = {
        containerName: body.containerName,
        containerId: body.containerId,
        status: body.status as ContainerStatus,
        eventType: body.eventType as ContainerEventType,
        exitCode: body.exitCode,
        errorMessage: body.errorMessage,
        restartAttempt: body.restartAttempt,
        maxRestarts: body.maxRestarts,
        timestamp: body.timestamp || new Date().toISOString(),
      }

      const result = await sendContainerAlert(alertData)

      return NextResponse.json({
        success: true,
        type: 'alert',
        ...result,
        duration: `${Date.now() - startTime}ms`,
      })
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
  } catch (error) {
    console.error('[Docker Health Webhook] Error:', error)
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
