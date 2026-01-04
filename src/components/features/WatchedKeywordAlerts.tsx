'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Bell, TrendingUp, TrendingDown, AlertTriangle, Loader2 } from 'lucide-react'
import type { WatchedKeywordAlert } from '@/types/recommendations'

interface WatchedKeywordAlertsProps {
  brandId?: string
}

/**
 * WatchedKeywordAlerts Component
 *
 * Displays alerts for watched keywords with significant ACOS changes (>20%).
 * Fetches alerts from /api/watched-keywords/alerts endpoint.
 *
 * Alert severity levels:
 * - warning: 20-50% ACOS change
 * - critical: >50% ACOS change
 *
 * Alert types:
 * - ACOS_INCREASE: Bad - ACOS went up (shown in red)
 * - ACOS_DECREASE: Good - ACOS went down (shown in green)
 */
export function WatchedKeywordAlerts({ brandId }: WatchedKeywordAlertsProps) {
  const [alerts, setAlerts] = useState<WatchedKeywordAlert[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchAlerts() {
      if (!brandId) {
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setError(null)

        const res = await fetch(`/api/watched-keywords/alerts?brandId=${brandId}`)
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to fetch alerts')
        }

        const data = await res.json()
        setAlerts(data.alerts || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch alerts')
      } finally {
        setIsLoading(false)
      }
    }

    fetchAlerts()
  }, [brandId])

  // Don't render if no brandId
  if (!brandId) {
    return null
  }

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            Watched Keyword Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  // Error state
  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            Watched Keyword Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    )
  }

  // Empty state
  if (alerts.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            Watched Keyword Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No alerts for your watched keywords. Keywords with &gt;20% ACOS changes will appear here.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Bell className="h-4 w-4 text-yellow-500" />
          Watched Keyword Alerts
          <Badge variant="secondary" className="ml-2">
            {alerts.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {alerts.map((alert) => (
            <AlertItem key={alert.watchedKeywordId} alert={alert} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Individual alert item display
 */
function AlertItem({ alert }: { alert: WatchedKeywordAlert }) {
  const isIncrease = alert.alertType === 'ACOS_INCREASE'
  const isCritical = alert.severity === 'critical'

  // Color coding: red for increase (bad), green for decrease (good)
  const changeColorClass = isIncrease ? 'text-red-600' : 'text-green-600'
  const TrendIcon = isIncrease ? TrendingUp : TrendingDown

  // Severity styling
  const severityBadgeClass = isCritical
    ? 'bg-red-100 text-red-800 border-red-200'
    : 'bg-yellow-100 text-yellow-800 border-yellow-200'

  const severityIconClass = isCritical ? 'text-red-500' : 'text-yellow-500'

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
      <AlertTriangle className={`h-5 w-5 mt-0.5 ${severityIconClass}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm truncate" title={alert.keyword}>
            {alert.keyword}
          </span>
          <Badge variant="outline" className={severityBadgeClass}>
            {isCritical ? 'Critical' : 'Warning'}
          </Badge>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            ACOS: {alert.previousAcos.toFixed(1)}% &rarr; {alert.currentAcos.toFixed(1)}%
          </span>
          <span className={`flex items-center gap-1 font-medium ${changeColorClass}`}>
            <TrendIcon className="h-3.5 w-3.5" />
            {alert.acosChangePercent > 0 ? '+' : ''}
            {alert.acosChangePercent.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  )
}
