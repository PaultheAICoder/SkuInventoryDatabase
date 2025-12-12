'use client'

/**
 * Sync History Component
 *
 * Displays recent sync logs with status and metrics.
 */

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw, FileText, Clock, AlertCircle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface SyncLog {
  id: string
  syncType: string
  status: string
  startedAt: string
  completedAt: string | null
  recordsProcessed: number
  recordsCreated: number
  recordsUpdated: number
  recordsFailed: number
  errorMessage: string | null
  fileName: string | null
  triggeredBy: string
  accountName: string | null
  integrationType: string | null
}

interface SyncHistoryProps {
  limit?: number
  credentialId?: string
}

export function SyncHistory({ limit = 10, credentialId }: SyncHistoryProps) {
  const [logs, setLogs] = useState<SyncLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      params.set('limit', limit.toString())
      if (credentialId) {
        params.set('credentialId', credentialId)
      }

      const response = await fetch(`/api/sync-logs?${params.toString()}`)
      if (!response.ok) {
        throw new Error('Failed to fetch sync logs')
      }
      const data = await response.json()
      setLogs(data.logs || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sync history')
    } finally {
      setLoading(false)
    }
  }, [limit, credentialId])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-600">Completed</Badge>
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>
      case 'partial':
        return <Badge variant="secondary" className="bg-yellow-500 text-black">Partial</Badge>
      case 'started':
        return <Badge variant="secondary">In Progress</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getSyncTypeLabel = (syncType: string) => {
    switch (syncType) {
      case 'amazon_ads_full':
        return 'Amazon Ads (Full)'
      case 'amazon_ads_incremental':
        return 'Amazon Ads (Incremental)'
      case 'shopify_orders':
        return 'Shopify Orders'
      case 'csv_upload':
        return 'CSV Upload'
      case 'retention_cleanup':
        return 'Data Cleanup'
      default:
        return syncType
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sync History</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Sync History</CardTitle>
            <CardDescription>Recent data synchronization operations</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchLogs}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {logs.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No sync history yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map(log => (
              <div
                key={log.id}
                className="flex items-start justify-between p-3 border rounded-lg"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {log.fileName ? (
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <RefreshCw className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="font-medium text-sm">{getSyncTypeLabel(log.syncType)}</span>
                    {getStatusBadge(log.status)}
                  </div>
                  <div className="text-xs text-muted-foreground space-x-3">
                    <span>{formatDistanceToNow(new Date(log.startedAt), { addSuffix: true })}</span>
                    {log.accountName && <span>• {log.accountName}</span>}
                    {log.triggeredBy && <span>• by {log.triggeredBy}</span>}
                  </div>
                  {log.status !== 'started' && (
                    <div className="text-xs">
                      <span className="text-muted-foreground">Processed: </span>
                      <span>{log.recordsProcessed}</span>
                      {log.recordsCreated > 0 && (
                        <>
                          <span className="text-muted-foreground"> • Created: </span>
                          <span className="text-green-600">{log.recordsCreated}</span>
                        </>
                      )}
                      {log.recordsUpdated > 0 && (
                        <>
                          <span className="text-muted-foreground"> • Updated: </span>
                          <span className="text-blue-600">{log.recordsUpdated}</span>
                        </>
                      )}
                      {log.recordsFailed > 0 && (
                        <>
                          <span className="text-muted-foreground"> • Failed: </span>
                          <span className="text-red-600">{log.recordsFailed}</span>
                        </>
                      )}
                    </div>
                  )}
                  {log.errorMessage && (
                    <div className="flex items-center gap-1 text-xs text-destructive">
                      <AlertCircle className="h-3 w-3" />
                      <span className="truncate max-w-xs" title={log.errorMessage}>
                        {log.errorMessage}
                      </span>
                    </div>
                  )}
                  {log.fileName && (
                    <div className="text-xs text-muted-foreground">
                      File: {log.fileName}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
