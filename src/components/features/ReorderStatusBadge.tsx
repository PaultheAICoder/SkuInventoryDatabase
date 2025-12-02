import { Badge } from '@/components/ui/badge'
import type { ReorderStatus } from '@/types'

interface ReorderStatusBadgeProps {
  status: ReorderStatus
  className?: string
}

const statusConfig = {
  critical: {
    variant: 'critical' as const,
    label: 'CRITICAL',
  },
  warning: {
    variant: 'warning' as const,
    label: 'WARNING',
  },
  ok: {
    variant: 'success' as const,
    label: 'OK',
  },
}

export function ReorderStatusBadge({ status, className }: ReorderStatusBadgeProps) {
  const config = statusConfig[status]

  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  )
}
