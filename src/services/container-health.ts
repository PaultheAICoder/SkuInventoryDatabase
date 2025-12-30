/**
 * Container Health Monitoring Service
 *
 * Handles:
 * - Recording health logs and events to database
 * - Querying health history
 * - Managing monitor configuration
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import type {
  ContainerStatus,
  ContainerEventType,
  ContainerHealthLogEntry,
  ContainerEventEntry,
  ContainerMonitorConfigResponse,
  ContainerStatusSummary,
} from '@/types/container-health'

/**
 * Get or create the singleton monitor configuration
 */
export async function getMonitorConfig(): Promise<ContainerMonitorConfigResponse | null> {
  const config = await prisma.containerMonitorConfig.findUnique({
    where: { id: 'singleton' },
  })

  if (!config) return null

  return {
    id: config.id,
    enableMonitoring: config.enableMonitoring,
    pollingIntervalSec: config.pollingIntervalSec,
    maxRestartAttempts: config.maxRestartAttempts,
    alertEmailAddresses: config.alertEmailAddresses,
    slackWebhookUrl: config.slackWebhookUrl,
    enableEmailAlerts: config.enableEmailAlerts,
    enableSlackAlerts: config.enableSlackAlerts,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  }
}

/**
 * Update monitor configuration
 */
export async function updateMonitorConfig(
  input: Partial<Omit<ContainerMonitorConfigResponse, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<ContainerMonitorConfigResponse> {
  const config = await prisma.containerMonitorConfig.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      enableMonitoring: input.enableMonitoring ?? true,
      pollingIntervalSec: input.pollingIntervalSec ?? 30,
      maxRestartAttempts: input.maxRestartAttempts ?? 5,
      alertEmailAddresses: input.alertEmailAddresses ?? [],
      slackWebhookUrl: input.slackWebhookUrl ?? null,
      enableEmailAlerts: input.enableEmailAlerts ?? false,
      enableSlackAlerts: input.enableSlackAlerts ?? false,
    },
    update: {
      ...input,
    },
  })

  return {
    id: config.id,
    enableMonitoring: config.enableMonitoring,
    pollingIntervalSec: config.pollingIntervalSec,
    maxRestartAttempts: config.maxRestartAttempts,
    alertEmailAddresses: config.alertEmailAddresses,
    slackWebhookUrl: config.slackWebhookUrl,
    enableEmailAlerts: config.enableEmailAlerts,
    enableSlackAlerts: config.enableSlackAlerts,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  }
}

/**
 * Record a health log entry
 */
export async function recordHealthLog(input: {
  containerName: string
  containerId?: string
  status: ContainerStatus
  exitCode?: number
  cpuPercent?: number
  memoryUsageMb?: number
  memoryLimitMb?: number
  healthOutput?: string
}): Promise<ContainerHealthLogEntry> {
  const log = await prisma.containerHealthLog.create({
    data: {
      containerName: input.containerName,
      containerId: input.containerId ?? null,
      status: input.status,
      exitCode: input.exitCode ?? null,
      cpuPercent: input.cpuPercent ?? null,
      memoryUsageMb: input.memoryUsageMb ?? null,
      memoryLimitMb: input.memoryLimitMb ?? null,
      healthOutput: input.healthOutput ?? null,
    },
  })

  return {
    id: log.id,
    containerName: log.containerName,
    containerId: log.containerId,
    status: log.status as ContainerStatus,
    exitCode: log.exitCode,
    cpuPercent: log.cpuPercent ? Number(log.cpuPercent) : null,
    memoryUsageMb: log.memoryUsageMb ? Number(log.memoryUsageMb) : null,
    memoryLimitMb: log.memoryLimitMb ? Number(log.memoryLimitMb) : null,
    healthOutput: log.healthOutput,
    createdAt: log.createdAt.toISOString(),
  }
}

/**
 * Record a container event
 */
export async function recordContainerEvent(input: {
  containerName: string
  containerId?: string
  eventType: ContainerEventType
  exitCode?: number
  details?: Record<string, unknown>
  logSnapshot?: string
}): Promise<ContainerEventEntry> {
  const event = await prisma.containerEvent.create({
    data: {
      containerName: input.containerName,
      containerId: input.containerId ?? null,
      eventType: input.eventType,
      exitCode: input.exitCode ?? null,
      details: (input.details ?? {}) as Prisma.InputJsonValue,
      logSnapshot: input.logSnapshot ?? null,
    },
  })

  return {
    id: event.id,
    containerName: event.containerName,
    containerId: event.containerId,
    eventType: event.eventType as ContainerEventType,
    exitCode: event.exitCode,
    details: event.details as Record<string, unknown>,
    logSnapshot: event.logSnapshot,
    createdAt: event.createdAt.toISOString(),
  }
}

/**
 * Get recent health logs for a container
 */
export async function getHealthLogs(
  containerName?: string,
  limit: number = 100,
  daysBack: number = 7
): Promise<ContainerHealthLogEntry[]> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - daysBack)

  const logs = await prisma.containerHealthLog.findMany({
    where: {
      ...(containerName && { containerName }),
      createdAt: { gte: cutoff },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return logs.map((log) => ({
    id: log.id,
    containerName: log.containerName,
    containerId: log.containerId,
    status: log.status as ContainerStatus,
    exitCode: log.exitCode,
    cpuPercent: log.cpuPercent ? Number(log.cpuPercent) : null,
    memoryUsageMb: log.memoryUsageMb ? Number(log.memoryUsageMb) : null,
    memoryLimitMb: log.memoryLimitMb ? Number(log.memoryLimitMb) : null,
    healthOutput: log.healthOutput,
    createdAt: log.createdAt.toISOString(),
  }))
}

/**
 * Get recent container events
 */
export async function getContainerEvents(
  containerName?: string,
  limit: number = 50,
  daysBack: number = 7
): Promise<ContainerEventEntry[]> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - daysBack)

  const events = await prisma.containerEvent.findMany({
    where: {
      ...(containerName && { containerName }),
      createdAt: { gte: cutoff },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return events.map((event) => ({
    id: event.id,
    containerName: event.containerName,
    containerId: event.containerId,
    eventType: event.eventType as ContainerEventType,
    exitCode: event.exitCode,
    details: event.details as Record<string, unknown>,
    logSnapshot: event.logSnapshot,
    createdAt: event.createdAt.toISOString(),
  }))
}

/**
 * Get container status summary for dashboard
 */
export async function getContainerStatusSummary(
  containerNames: string[]
): Promise<ContainerStatusSummary[]> {
  const cutoff24h = new Date()
  cutoff24h.setHours(cutoff24h.getHours() - 24)

  const summaries: ContainerStatusSummary[] = []

  for (const containerName of containerNames) {
    // Get latest health log
    const latestHealth = await prisma.containerHealthLog.findFirst({
      where: { containerName },
      orderBy: { createdAt: 'desc' },
    })

    // Get recent events (last 5)
    const recentEvents = await prisma.containerEvent.findMany({
      where: { containerName },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })

    // Count restarts in last 24h
    const restartCount = await prisma.containerEvent.count({
      where: {
        containerName,
        eventType: 'restart',
        createdAt: { gte: cutoff24h },
      },
    })

    summaries.push({
      containerName,
      currentStatus: (latestHealth?.status as ContainerStatus) ?? 'unknown',
      lastHealthCheck: latestHealth?.createdAt.toISOString() ?? null,
      recentEvents: recentEvents.map((e) => ({
        id: e.id,
        containerName: e.containerName,
        containerId: e.containerId,
        eventType: e.eventType as ContainerEventType,
        exitCode: e.exitCode,
        details: e.details as Record<string, unknown>,
        logSnapshot: e.logSnapshot,
        createdAt: e.createdAt.toISOString(),
      })),
      restartCount24h: restartCount,
      isRunning: latestHealth?.status === 'healthy' || latestHealth?.status === 'starting',
    })
  }

  return summaries
}

/**
 * Cleanup old health data (retention: 30 days)
 */
export async function cleanupOldHealthData(): Promise<{ logsDeleted: number; eventsDeleted: number }> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)

  const [logsResult, eventsResult] = await Promise.all([
    prisma.containerHealthLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    }),
    prisma.containerEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    }),
  ])

  return {
    logsDeleted: logsResult.count,
    eventsDeleted: eventsResult.count,
  }
}
