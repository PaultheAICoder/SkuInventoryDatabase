'use client'

/**
 * Shopify Connection Card Component
 *
 * Displays connection status, shop name, and connect/disconnect/sync buttons.
 * Shows read-only badge since Shopify integration uses read-only OAuth scopes.
 */

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, ExternalLink, RefreshCw, Unlink, Store, Eye } from 'lucide-react'
import { SyncStatus } from './sync-status'

interface ShopifyConnectionStatus {
  connected: boolean
  shopName: string | null
  syncStatus: 'idle' | 'syncing' | 'error' | null
  lastSyncAt: string | null
  lastError: string | null
  ordersCount: number
  productsCount: number
}

interface ShopifyCardProps {
  isAdmin?: boolean
  onSyncComplete?: () => void
}

export function ShopifyCard({ isAdmin = false, onSyncComplete }: ShopifyCardProps) {
  const [status, setStatus] = useState<ShopifyConnectionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shopInput, setShopInput] = useState('')
  const [showConnectForm, setShowConnectForm] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/integrations/shopify/status')
      if (!response.ok) {
        throw new Error('Failed to fetch status')
      }
      const data = await response.json()
      setStatus(data)
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
    if (!shopInput.trim()) {
      setError('Please enter your Shopify store name')
      return
    }

    setConnecting(true)
    setError(null)

    try {
      // Normalize shop name
      let shop = shopInput.trim().toLowerCase()
      if (!shop.includes('.myshopify.com')) {
        shop = `${shop}.myshopify.com`
      }

      const response = await fetch('/api/integrations/shopify/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to initiate connection')
      }

      const data = await response.json()

      // Redirect to Shopify authorization URL
      window.location.href = data.authUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect')
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect this Shopify store?')) {
      return
    }

    setDisconnecting(true)
    setError(null)

    try {
      const response = await fetch('/api/integrations/shopify/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to disconnect')
      }

      // Refresh status
      await fetchStatus()
      setShowConnectForm(false)
      setShopInput('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect')
    } finally {
      setDisconnecting(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    setError(null)

    try {
      const response = await fetch('/api/integrations/shopify/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Sync failed')
      }

      const result = await response.json()

      // Refresh status
      await fetchStatus()

      if (onSyncComplete) {
        onSyncComplete()
      }

      // Show success message briefly
      if (result.success) {
        setError(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const getSyncStatusBadge = (syncStatus: ShopifyConnectionStatus['syncStatus']) => {
    switch (syncStatus) {
      case 'syncing':
        return <Badge variant="secondary" className="bg-blue-500 text-white">Syncing</Badge>
      case 'error':
        return <Badge variant="destructive">Error</Badge>
      default:
        return null
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            <span>Shopify</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  const isConnected = status?.connected ?? false

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              <span>Shopify</span>
              {isConnected && (
                <>
                  <Badge variant="default" className="bg-green-600">Connected</Badge>
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    Read-only
                  </Badge>
                </>
              )}
              {isConnected && status?.syncStatus && getSyncStatusBadge(status.syncStatus)}
            </CardTitle>
            <CardDescription>
              Connect your Shopify store to import order data for sales tracking.
            </CardDescription>
          </div>
          {isAdmin && !isConnected && !showConnectForm && (
            <Button onClick={() => setShowConnectForm(true)}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Connect
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

        {!isConnected && !showConnectForm ? (
          <div className="text-center py-6 text-muted-foreground">
            <p>No Shopify store connected.</p>
            {isAdmin && (
              <p className="text-sm mt-1">Click Connect to link your Shopify store.</p>
            )}
          </div>
        ) : !isConnected && showConnectForm ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="shop-name">Shopify Store Name</Label>
              <div className="flex gap-2">
                <Input
                  id="shop-name"
                  placeholder="mystore"
                  value={shopInput}
                  onChange={(e) => setShopInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                />
                <span className="flex items-center text-muted-foreground">.myshopify.com</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter your store name (e.g., &quot;mystore&quot; from mystore.myshopify.com)
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleConnect} disabled={connecting}>
                {connecting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Connect to Shopify
                  </>
                )}
              </Button>
              <Button variant="ghost" onClick={() => setShowConnectForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <div className="font-medium">
                  {status?.shopName || 'Shopify Store'}
                </div>
                <div className="text-sm text-muted-foreground">
                  {status?.ordersCount ?? 0} orders synced
                </div>
                <SyncStatus
                  lastSyncAt={status?.lastSyncAt ?? null}
                  lastSyncStatus={status?.syncStatus === 'error' ? 'error' : status?.syncStatus === 'syncing' ? 'syncing' : 'success'}
                  lastError={status?.lastError ?? null}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSync}
                  disabled={syncing || status?.syncStatus === 'syncing'}
                >
                  {syncing || status?.syncStatus === 'syncing' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Sync Now
                    </>
                  )}
                </Button>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                  >
                    {disconnecting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Unlink className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
