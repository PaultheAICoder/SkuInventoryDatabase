/**
 * Container health monitoring types
 */

export type ContainerStatus = 'healthy' | 'unhealthy' | 'starting' | 'none' | 'unknown'

export type ContainerEventType =
  | 'start'
  | 'stop'
  | 'die'
  | 'restart'
  | 'health_status'
  | 'alert_sent'
  | 'auto_restart_attempt'
  | 'auto_restart_failed'

export interface ContainerHealthLogEntry {
  id: string
  containerName: string
  containerId: string | null
  status: ContainerStatus
  exitCode: number | null
  cpuPercent: number | null
  memoryUsageMb: number | null
  memoryLimitMb: number | null
  healthOutput: string | null
  createdAt: string
}

export interface ContainerEventEntry {
  id: string
  containerName: string
  containerId: string | null
  eventType: ContainerEventType
  exitCode: number | null
  details: Record<string, unknown>
  logSnapshot: string | null
  createdAt: string
}

export interface ContainerMonitorConfigResponse {
  id: string
  enableMonitoring: boolean
  pollingIntervalSec: number
  maxRestartAttempts: number
  alertEmailAddresses: string[]
  slackWebhookUrl: string | null
  enableEmailAlerts: boolean
  enableSlackAlerts: boolean
  createdAt: string
  updatedAt: string
}

export interface ContainerStatusSummary {
  containerName: string
  currentStatus: ContainerStatus
  lastHealthCheck: string | null
  recentEvents: ContainerEventEntry[]
  restartCount24h: number
  isRunning: boolean
}

export interface DockerHealthDashboardData {
  containers: ContainerStatusSummary[]
  config: ContainerMonitorConfigResponse | null
  recentEvents: ContainerEventEntry[]
  healthHistory: ContainerHealthLogEntry[]
}
