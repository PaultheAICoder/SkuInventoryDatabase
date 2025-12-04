'use client'

import { Badge } from '@/components/ui/badge'

export type ForecastStatus = 'critical' | 'warning' | 'ok' | 'na'

interface ForecastStatusBadgeProps {
  averageDailyConsumption: string
  recommendedReorderDate: string | null
}

export function getForecastStatus(
  averageDailyConsumption: string,
  recommendedReorderDate: string | null
): ForecastStatus {
  // Zero consumption = N/A
  if (parseFloat(averageDailyConsumption) === 0) {
    return 'na'
  }

  // No reorder needed = OK
  if (!recommendedReorderDate) {
    return 'ok'
  }

  const reorderDate = new Date(recommendedReorderDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const daysUntilReorder = Math.ceil((reorderDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (daysUntilReorder <= 0) {
    return 'critical'
  }
  if (daysUntilReorder <= 7) {
    return 'warning'
  }
  return 'ok'
}

const statusConfig = {
  critical: { variant: 'critical' as const, label: 'CRITICAL' },
  warning: { variant: 'warning' as const, label: 'WARNING' },
  ok: { variant: 'success' as const, label: 'OK' },
  na: { variant: 'secondary' as const, label: 'N/A' },
}

export function ForecastStatusBadge({ averageDailyConsumption, recommendedReorderDate }: ForecastStatusBadgeProps) {
  const status = getForecastStatus(averageDailyConsumption, recommendedReorderDate)
  const config = statusConfig[status]

  return <Badge variant={config.variant}>{config.label}</Badge>
}
