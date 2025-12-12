'use client'

/**
 * Sync Status Display Component
 *
 * Shows last sync time and status badge.
 */

import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'

interface SyncStatusProps {
  lastSyncAt: string | null
  lastSyncStatus: string | null
  lastError?: string | null
  className?: string
}

export function SyncStatus({
  lastSyncAt,
  lastSyncStatus,
  lastError,
  className = '',
}: SyncStatusProps) {
  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-600 text-xs">Completed</Badge>
      case 'failed':
        return <Badge variant="destructive" className="text-xs">Failed</Badge>
      case 'partial':
        return <Badge variant="secondary" className="bg-yellow-500 text-black text-xs">Partial</Badge>
      case 'started':
        return <Badge variant="secondary" className="text-xs">In Progress</Badge>
      default:
        return null
    }
  }

  if (!lastSyncAt) {
    return (
      <div className={`text-sm text-muted-foreground ${className}`}>
        Never synced
      </div>
    )
  }

  const syncTime = new Date(lastSyncAt)
  const timeAgo = formatDistanceToNow(syncTime, { addSuffix: true })

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Last sync:</span>
        <span>{timeAgo}</span>
        {getStatusBadge(lastSyncStatus)}
      </div>
      {lastError && lastSyncStatus === 'failed' && (
        <div className="text-xs text-destructive truncate max-w-xs" title={lastError}>
          {lastError}
        </div>
      )}
    </div>
  )
}
