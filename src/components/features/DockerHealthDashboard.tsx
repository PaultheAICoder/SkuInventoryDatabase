'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Server,
  Activity,
  Bell,
  BellOff,
  Plus,
  X,
  Mail,
} from 'lucide-react'
import { toast } from 'sonner'
import type {
  DockerHealthDashboardData,
  ContainerStatusSummary,
  ContainerEventEntry,
  ContainerMonitorConfigResponse,
} from '@/types/container-health'

interface DockerHealthDashboardProps {
  data: DockerHealthDashboardData | null
  onRefresh: () => void
}

function ContainerStatusCard({ container }: { container: ContainerStatusSummary }) {
  const statusIcon =
    container.currentStatus === 'healthy' ? (
      <CheckCircle className="h-5 w-5 text-green-600" />
    ) : container.currentStatus === 'unhealthy' ? (
      <XCircle className="h-5 w-5 text-destructive" />
    ) : container.currentStatus === 'stopped' || container.currentStatus === 'not_found' ? (
      <XCircle className="h-5 w-5 text-gray-500" />
    ) : container.currentStatus === 'unknown' ? (
      <AlertCircle className="h-5 w-5 text-gray-400" />
    ) : (
      <AlertCircle className="h-5 w-5 text-yellow-500" />
    )

  const statusColor =
    container.currentStatus === 'healthy'
      ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
      : container.currentStatus === 'unhealthy'
        ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
        : container.currentStatus === 'stopped' || container.currentStatus === 'not_found'
          ? 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
          : container.currentStatus === 'unknown'
            ? 'bg-gray-100 text-gray-600 dark:bg-gray-900/20 dark:text-gray-500'
            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="h-4 w-4" />
            {container.containerName}
          </CardTitle>
          {statusIcon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge className={statusColor}>{container.currentStatus}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Last Check</span>
            <span className="text-sm">
              {container.lastHealthCheck
                ? new Date(container.lastHealthCheck).toLocaleTimeString()
                : 'N/A'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Restarts (24h)</span>
            <span className={`text-sm font-medium ${container.restartCount24h > 0 ? 'text-destructive' : ''}`}>
              {container.restartCount24h}
            </span>
          </div>
          {container.statusReason && container.statusReason !== 'healthy' && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Info</span>
              <span className="text-xs text-muted-foreground">
                {container.statusReason === 'no_data' && 'Never checked'}
                {container.statusReason === 'stale_data' && 'Data may be stale'}
                {container.statusReason === 'container_stopped' && 'Container stopped'}
                {container.statusReason === 'container_not_found' && 'Container not found'}
                {container.statusReason === 'unhealthy' && 'Health check failing'}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function EventsTable({ events }: { events: ContainerEventEntry[] }) {
  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No events recorded in the selected time period
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Container</TableHead>
          <TableHead>Event</TableHead>
          <TableHead>Exit Code</TableHead>
          <TableHead>Details</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.slice(0, 20).map((event) => (
          <TableRow key={event.id}>
            <TableCell className="text-sm">
              {new Date(event.createdAt).toLocaleString()}
            </TableCell>
            <TableCell className="font-medium">{event.containerName}</TableCell>
            <TableCell>
              <Badge variant={
                event.eventType === 'die' || event.eventType === 'auto_restart_failed'
                  ? 'destructive'
                  : event.eventType === 'restart'
                  ? 'secondary'
                  : 'outline'
              }>
                {event.eventType}
              </Badge>
            </TableCell>
            <TableCell>{event.exitCode ?? '-'}</TableCell>
            <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
              {Object.keys(event.details).length > 0
                ? JSON.stringify(event.details).slice(0, 50)
                : '-'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function ConfigForm({
  config,
  onSave
}: {
  config: ContainerMonitorConfigResponse | null
  onSave: (config: Partial<ContainerMonitorConfigResponse>) => Promise<void>
}) {
  const [enableEmailAlerts, setEnableEmailAlerts] = useState(config?.enableEmailAlerts ?? false)
  const [enableSlackAlerts, setEnableSlackAlerts] = useState(config?.enableSlackAlerts ?? false)
  const [slackWebhookUrl, setSlackWebhookUrl] = useState('')
  const [emailAddresses, setEmailAddresses] = useState<string[]>(config?.alertEmailAddresses ?? [])
  const [newEmail, setNewEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (config) {
      setEnableEmailAlerts(config.enableEmailAlerts)
      setEnableSlackAlerts(config.enableSlackAlerts)
      setEmailAddresses(config.alertEmailAddresses)
    }
  }, [config])

  const addEmail = () => {
    setEmailError(null)
    const email = newEmail.trim().toLowerCase()

    if (!email) return

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Please enter a valid email address')
      return
    }

    if (emailAddresses.includes(email)) {
      setEmailError('This email is already added')
      return
    }

    setEmailAddresses([...emailAddresses, email])
    setNewEmail('')
  }

  const removeEmail = (email: string) => {
    setEmailAddresses(emailAddresses.filter((e) => e !== email))
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onSave({
        enableEmailAlerts,
        enableSlackAlerts,
        alertEmailAddresses: emailAddresses,
        ...(slackWebhookUrl && { slackWebhookUrl }),
      })
      setSlackWebhookUrl('')
      toast.success('Configuration saved')
    } catch {
      toast.error('Failed to save configuration')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {enableEmailAlerts || enableSlackAlerts ? (
            <Bell className="h-5 w-5 text-green-600" />
          ) : (
            <BellOff className="h-5 w-5 text-muted-foreground" />
          )}
          Alert Configuration
        </CardTitle>
        <CardDescription>
          Configure notifications for container failures
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Email Alerts */}
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <input
              id="enableEmailAlerts"
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300"
              checked={enableEmailAlerts}
              onChange={(e) => setEnableEmailAlerts(e.target.checked)}
              disabled={isSaving}
            />
            <Label htmlFor="enableEmailAlerts">Enable Email Alerts</Label>
          </div>

          {emailAddresses.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {emailAddresses.map((email) => (
                <div
                  key={email}
                  className="flex items-center gap-1 bg-secondary px-2 py-1 rounded-md text-sm"
                >
                  <Mail className="h-3 w-3" />
                  <span>{email}</span>
                  <button
                    type="button"
                    onClick={() => removeEmail(email)}
                    className="ml-1 hover:text-destructive"
                    disabled={isSaving}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="alert@example.com"
              value={newEmail}
              onChange={(e) => {
                setNewEmail(e.target.value)
                setEmailError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addEmail()
                }
              }}
              disabled={isSaving}
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={addEmail}
              disabled={isSaving || !newEmail}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {emailError && (
            <p className="text-xs text-destructive">{emailError}</p>
          )}
        </div>

        {/* Slack Alerts */}
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <input
              id="enableSlackAlerts"
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300"
              checked={enableSlackAlerts}
              onChange={(e) => setEnableSlackAlerts(e.target.checked)}
              disabled={isSaving}
            />
            <Label htmlFor="enableSlackAlerts">Enable Slack Alerts</Label>
          </div>

          <Input
            type="password"
            placeholder={config?.slackWebhookUrl ? '****' : 'https://hooks.slack.com/services/...'}
            value={slackWebhookUrl}
            onChange={(e) => setSlackWebhookUrl(e.target.value)}
            disabled={isSaving}
          />
          <p className="text-xs text-muted-foreground">
            {config?.slackWebhookUrl
              ? 'A webhook URL is stored. Enter a new URL to update it.'
              : 'Enter your Slack incoming webhook URL'}
          </p>
        </div>

        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Configuration'
          )}
        </Button>
      </CardContent>
    </Card>
  )
}

export function DockerHealthDashboard({ data, onRefresh }: DockerHealthDashboardProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await onRefresh()
    setIsRefreshing(false)
  }

  const handleSaveConfig = async (configUpdate: Partial<ContainerMonitorConfigResponse>) => {
    const res = await fetch('/api/admin/docker-health', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(configUpdate),
    })

    if (!res.ok) {
      throw new Error('Failed to save')
    }

    onRefresh()
  }

  if (!data) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        No data available
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with refresh button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Last updated: {new Date().toLocaleTimeString()}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      {/* Container Status Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {data.containers.map((container) => (
          <ContainerStatusCard key={container.containerName} container={container} />
        ))}
      </div>

      {/* Recent Events */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Events</CardTitle>
          <CardDescription>Container events from the last 7 days</CardDescription>
        </CardHeader>
        <CardContent>
          <EventsTable events={data.recentEvents} />
        </CardContent>
      </Card>

      {/* Alert Configuration */}
      <ConfigForm config={data.config} onSave={handleSaveConfig} />
    </div>
  )
}
