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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CheckCircle,
  XCircle,
  Loader2,
  Bell,
  BellOff,
  MessageSquare,
} from 'lucide-react'
import { toast } from 'sonner'

interface AlertConfig {
  id: string
  companyId: string
  slackWebhookUrl: string | null
  hasWebhook: boolean
  emailAddresses: string[]
  enableSlack: boolean
  enableEmail: boolean
  alertMode: 'daily_digest' | 'per_transition'
  lastDigestSent: string | null
}

interface AlertConfigFormProps {
  config: AlertConfig | null
  onRefresh: () => void
}

export function AlertConfigForm({ config, onRefresh }: AlertConfigFormProps) {
  const [webhookUrl, setWebhookUrl] = useState('')
  const [enableSlack, setEnableSlack] = useState(config?.enableSlack ?? false)
  const [alertMode, setAlertMode] = useState<'daily_digest' | 'per_transition'>(
    config?.alertMode ?? 'daily_digest'
  )
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message?: string
    error?: string
  } | null>(null)

  // Sync form state when config changes
  useEffect(() => {
    if (config) {
      setEnableSlack(config.enableSlack)
      setAlertMode(config.alertMode)
    }
  }, [config])

  const handleTestWebhook = async () => {
    setIsTesting(true)
    setTestResult(null)

    try {
      const body = webhookUrl ? { webhookUrl } : {}
      const res = await fetch('/api/settings/alerts/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.status === 403) {
        toast.error('You do not have permission to test webhooks')
        return
      }

      const data = await res.json()

      if (data.error) {
        toast.error(data.error)
        return
      }

      setTestResult(data.data)
      if (data.data?.success) {
        toast.success('Test message sent to Slack!')
      } else {
        toast.error(data.data?.error || 'Test failed')
      }
    } catch {
      toast.error('Failed to test webhook')
    } finally {
      setIsTesting(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)

    try {
      const payload: Record<string, unknown> = {
        enableSlack,
        alertMode,
      }

      // Only include webhook URL if user entered one
      if (webhookUrl) {
        payload.slackWebhookUrl = webhookUrl
      }

      const res = await fetch('/api/settings/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.status === 403) {
        toast.error('You do not have permission to update settings')
        return
      }

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || 'Failed to save')
      }

      toast.success('Alert settings saved')
      setWebhookUrl('') // Clear webhook field
      setTestResult(null)
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  const isLoading = isSaving || isTesting
  const hasStoredWebhook = config?.hasWebhook ?? false
  const canTest = webhookUrl || hasStoredWebhook
  const canSave = webhookUrl || hasStoredWebhook

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              {enableSlack ? (
                <Bell className="h-5 w-5 text-green-600" />
              ) : (
                <BellOff className="h-5 w-5 text-muted-foreground" />
              )}
              Slack Alerts
            </CardTitle>
            <Badge variant={enableSlack && hasStoredWebhook ? 'default' : 'secondary'}>
              {enableSlack && hasStoredWebhook ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
          <CardDescription>
            {enableSlack && hasStoredWebhook
              ? 'Low-stock alerts will be sent to your Slack channel'
              : 'Configure a webhook to receive alerts in Slack'}
          </CardDescription>
        </CardHeader>
        {config && (
          <CardContent>
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Alert Mode</span>
                <span className="capitalize">
                  {config.alertMode.replace('_', ' ')}
                </span>
              </div>
              {config.lastDigestSent && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Digest Sent</span>
                  <span>{new Date(config.lastDigestSent).toLocaleString()}</span>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Slack Configuration
          </CardTitle>
          <CardDescription>
            Enter your Slack incoming webhook URL to receive alerts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Enable Toggle */}
          <div className="flex items-center space-x-2">
            <input
              id="enableSlack"
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300"
              checked={enableSlack}
              onChange={(e) => setEnableSlack(e.target.checked)}
              disabled={isLoading}
            />
            <div>
              <Label htmlFor="enableSlack" className="font-normal">
                Enable Slack Alerts
              </Label>
              <p className="text-xs text-muted-foreground">
                Receive low-stock notifications in your Slack workspace
              </p>
            </div>
          </div>

          {/* Webhook URL */}
          <div className="space-y-2">
            <Label htmlFor="webhookUrl">Webhook URL</Label>
            <Input
              id="webhookUrl"
              type="password"
              placeholder={
                hasStoredWebhook
                  ? `****${config?.slackWebhookUrl || ''}`
                  : 'https://hooks.slack.com/services/...'
              }
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              {hasStoredWebhook
                ? 'A webhook URL is stored. Enter a new URL to update it.'
                : 'Create an incoming webhook in your Slack workspace settings'}
            </p>
          </div>

          {/* Alert Mode */}
          <div className="space-y-2">
            <Label htmlFor="alertMode">Alert Mode</Label>
            <Select
              value={alertMode}
              onValueChange={(value) =>
                setAlertMode(value as 'daily_digest' | 'per_transition')
              }
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily_digest">
                  Daily Digest - Single summary each day
                </SelectItem>
                <SelectItem value="per_transition">
                  Immediate - Alert on each status change
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Daily digest sends one summary; immediate alerts on each state transition
            </p>
          </div>

          {/* Test Result Display */}
          {testResult && (
            <div
              className={`rounded-md p-4 ${
                testResult.success
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-destructive/10 border border-destructive/20'
              }`}
            >
              <div className="flex items-start gap-3">
                {testResult.success ? (
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                ) : (
                  <XCircle className="h-5 w-5 text-destructive mt-0.5" />
                )}
                <div>
                  <p
                    className={`font-medium ${
                      testResult.success ? 'text-green-800' : 'text-destructive'
                    }`}
                  >
                    {testResult.success ? 'Test Successful' : 'Test Failed'}
                  </p>
                  <p className="mt-1 text-sm">
                    {testResult.success
                      ? testResult.message
                      : testResult.error}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleTestWebhook}
              disabled={!canTest || isLoading}
            >
              {isTesting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                'Test Webhook'
              )}
            </Button>

            <Button
              type="button"
              onClick={handleSave}
              disabled={!canSave || isLoading}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Settings'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Email Configuration Card (Placeholder) */}
      <Card className="opacity-50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Email Alerts</CardTitle>
            <Badge variant="secondary">Coming Soon</Badge>
          </div>
          <CardDescription>
            Email alert configuration will be available in a future update
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
