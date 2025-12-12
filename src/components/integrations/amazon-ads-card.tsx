'use client'

/**
 * Amazon Ads Connection Card Component
 *
 * Displays connection status, account name, and connect/disconnect buttons.
 */

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, ExternalLink, RefreshCw, Unlink } from 'lucide-react'
import { SyncStatus } from './sync-status'

interface AmazonAdsCredential {
  id: string
  brandId: string | null
  brandName: string | null
  status: 'active' | 'expired' | 'revoked' | 'error'
  externalAccountName: string | null
  lastSyncAt: string | null
  lastSyncStatus: string | null
  lastError: string | null
  createdAt: string
}

interface AmazonAdsCardProps {
  isAdmin?: boolean
  onSync?: (credentialId: string) => void
}

export function AmazonAdsCard({ isAdmin = false, onSync }: AmazonAdsCardProps) {
  const [credentials, setCredentials] = useState<AmazonAdsCredential[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/integrations/amazon-ads/status')
      if (!response.ok) {
        throw new Error('Failed to fetch status')
      }
      const data = await response.json()
      setCredentials(data.credentials || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load status')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const handleConnect = async () => {
    setConnecting(true)
    setError(null)

    try {
      const response = await fetch('/api/integrations/amazon-ads/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to initiate connection')
      }

      const data = await response.json()

      // Redirect to Amazon authorization URL
      window.location.href = data.authUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect')
      setConnecting(false)
    }
  }

  const handleDisconnect = async (credentialId: string) => {
    if (!confirm('Are you sure you want to disconnect this Amazon Ads account?')) {
      return
    }

    setDisconnecting(credentialId)
    setError(null)

    try {
      const response = await fetch('/api/integrations/amazon-ads/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentialId }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to disconnect')
      }

      // Refresh status
      await fetchStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect')
    } finally {
      setDisconnecting(null)
    }
  }

  const getStatusBadge = (status: AmazonAdsCredential['status']) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-600">Connected</Badge>
      case 'expired':
        return <Badge variant="secondary" className="bg-yellow-500 text-black">Expired</Badge>
      case 'revoked':
        return <Badge variant="destructive">Revoked</Badge>
      case 'error':
        return <Badge variant="destructive">Error</Badge>
      default:
        return <Badge variant="secondary">Unknown</Badge>
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>Amazon Ads</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  const activeCredentials = credentials.filter(c => c.status !== 'revoked')
  const hasConnection = activeCredentials.length > 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <span>Amazon Ads</span>
              {hasConnection && getStatusBadge(activeCredentials[0].status)}
            </CardTitle>
            <CardDescription>
              Connect your Amazon Advertising account to import campaign data.
            </CardDescription>
          </div>
          {isAdmin && !hasConnection && (
            <Button onClick={handleConnect} disabled={connecting}>
              {connecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Connect
                </>
              )}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!hasConnection ? (
          <div className="text-center py-6 text-muted-foreground">
            <p>No Amazon Ads account connected.</p>
            {isAdmin && (
              <p className="text-sm mt-1">Click Connect to link your advertising account.</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {activeCredentials.map(credential => (
              <div
                key={credential.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div>
                  <div className="font-medium">
                    {credential.externalAccountName || 'Amazon Ads Account'}
                  </div>
                  {credential.brandName && (
                    <div className="text-sm text-muted-foreground">
                      Brand: {credential.brandName}
                    </div>
                  )}
                  <SyncStatus
                    lastSyncAt={credential.lastSyncAt}
                    lastSyncStatus={credential.lastSyncStatus}
                    lastError={credential.lastError}
                  />
                </div>
                <div className="flex items-center gap-2">
                  {onSync && credential.status === 'active' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSync(credential.id)}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Sync Now
                    </Button>
                  )}
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDisconnect(credential.id)}
                      disabled={disconnecting === credential.id}
                    >
                      {disconnecting === credential.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Unlink className="h-4 w-4" />
                      )}
                    </Button>
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
