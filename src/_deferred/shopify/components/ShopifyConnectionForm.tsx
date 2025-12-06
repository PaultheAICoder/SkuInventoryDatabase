'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { CheckCircle, XCircle, Loader2, Wifi, WifiOff, Store } from 'lucide-react'
import { toast } from 'sonner'
import type { ConnectionResponse, TestConnectionResponse } from '@/types/shopify-connection'

interface ShopifyConnectionFormProps {
  connection: ConnectionResponse | null
  isAdmin: boolean
  onRefresh: () => void
}

export function ShopifyConnectionForm({ connection, isAdmin, onRefresh }: ShopifyConnectionFormProps) {
  const [shopName, setShopName] = useState(connection?.shopName || '')
  const [accessToken, setAccessToken] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [testResult, setTestResult] = useState<TestConnectionResponse | null>(null)

  // Update form when connection prop changes
  useEffect(() => {
    if (connection) {
      setShopName(connection.shopName)
    }
  }, [connection])

  const handleTestConnection = async () => {
    setIsTesting(true)
    setTestResult(null)
    try {
      const body = accessToken ? { shopName, accessToken } : {} // Use stored credentials if no new token
      const res = await fetch('/api/shopify/connection/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.status === 403) {
        toast.error('You do not have permission to test connections')
        return
      }

      const data = await res.json()

      if (data.error) {
        toast.error(data.error)
        return
      }

      setTestResult(data.data)
      if (data.data?.success) {
        toast.success('Connection successful!')
      } else {
        toast.error(data.data?.error || 'Connection failed')
      }
    } catch {
      toast.error('Failed to test connection')
    } finally {
      setIsTesting(false)
    }
  }

  const handleSave = async () => {
    if (!shopName) {
      toast.error('Shop name is required')
      return
    }
    if (!accessToken && !connection?.hasToken) {
      toast.error('Access token is required')
      return
    }
    if (!accessToken && connection?.hasToken) {
      toast.error('Please enter the access token to update the connection')
      return
    }

    setIsSaving(true)
    try {
      const res = await fetch('/api/shopify/connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopName, accessToken }),
      })

      if (res.status === 403) {
        toast.error('You do not have permission to save connections')
        return
      }

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }

      toast.success('Connection saved successfully')
      setAccessToken('') // Clear token from form
      setTestResult(null) // Clear test result
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save connection')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDisconnect = async () => {
    setIsDisconnecting(true)
    try {
      const res = await fetch('/api/shopify/connection', { method: 'DELETE' })

      if (res.status === 403) {
        toast.error('You do not have permission to disconnect')
        return
      }

      if (!res.ok) {
        throw new Error('Failed to disconnect')
      }

      toast.success('Shopify connection removed')
      setShopName('')
      setAccessToken('')
      setTestResult(null)
      onRefresh()
    } catch {
      toast.error('Failed to disconnect')
    } finally {
      setIsDisconnecting(false)
    }
  }

  const isConnected = connection?.isActive
  const hasStoredToken = connection?.hasToken
  const canTest = isAdmin && (accessToken || hasStoredToken)
  const canSave = isAdmin && shopName && accessToken
  const isLoading = isSaving || isTesting || isDisconnecting

  return (
    <div className="space-y-6">
      {/* Connection Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              {isConnected ? (
                <Wifi className="h-5 w-5 text-green-600" />
              ) : (
                <WifiOff className="h-5 w-5 text-muted-foreground" />
              )}
              Connection Status
            </CardTitle>
            <Badge variant={isConnected ? 'default' : 'secondary'}>
              {isConnected ? 'Connected' : 'Not Connected'}
            </Badge>
          </div>
          <CardDescription>
            {isConnected
              ? `Connected to ${connection?.shopName}.myshopify.com`
              : 'No Shopify store connected'}
          </CardDescription>
        </CardHeader>
        {connection && (
          <CardContent>
            <div className="grid gap-2 text-sm">
              {connection.lastSyncAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Sync</span>
                  <span>{new Date(connection.lastSyncAt).toLocaleString()}</span>
                </div>
              )}
              {connection.syncStatus && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sync Status</span>
                  <Badge variant="outline">{connection.syncStatus}</Badge>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle>Store Configuration</CardTitle>
          <CardDescription>
            {isAdmin
              ? 'Enter your Shopify store credentials to connect'
              : 'View your Shopify store configuration (read-only)'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="shopName">Shop Name</Label>
            <div className="flex gap-2">
              <Input
                id="shopName"
                placeholder="mystore"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                disabled={!isAdmin || isLoading}
              />
              <span className="flex items-center text-sm text-muted-foreground whitespace-nowrap">
                .myshopify.com
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter just the store name (e.g., &quot;mystore&quot; for mystore.myshopify.com)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="accessToken">Access Token</Label>
            <Input
              id="accessToken"
              type="password"
              placeholder={hasStoredToken ? '********** (stored securely)' : 'shpat_xxxxxxxx'}
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              disabled={!isAdmin || isLoading}
            />
            <p className="text-xs text-muted-foreground">
              {hasStoredToken
                ? 'A token is already stored. Enter a new token to update it.'
                : 'Enter your Shopify Admin API access token'}
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
                  <p className={`font-medium ${testResult.success ? 'text-green-800' : 'text-destructive'}`}>
                    {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                  </p>
                  {testResult.success && testResult.shopInfo && (
                    <div className="mt-2 space-y-1 text-sm text-green-700">
                      <div className="flex items-center gap-2">
                        <Store className="h-4 w-4" />
                        <span>{testResult.shopInfo.name}</span>
                      </div>
                      <p>Domain: {testResult.shopInfo.domain}</p>
                      <p>Email: {testResult.shopInfo.email}</p>
                      <p>Currency: {testResult.shopInfo.currency}</p>
                      <p>Plan: {testResult.shopInfo.plan}</p>
                    </div>
                  )}
                  {!testResult.success && testResult.error && (
                    <p className="mt-1 text-sm text-destructive">{testResult.error}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          {isAdmin && (
            <div className="flex flex-wrap gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleTestConnection}
                disabled={!canTest || isLoading}
              >
                {isTesting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  'Test Connection'
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
                ) : connection ? (
                  'Update Connection'
                ) : (
                  'Save Connection'
                )}
              </Button>

              {connection && connection.isActive && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={isLoading}>
                      {isDisconnecting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Disconnecting...
                        </>
                      ) : (
                        'Disconnect'
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Disconnect Shopify Store?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will disconnect your Shopify store from this account. Any pending syncs
                        will be cancelled. You can reconnect at any time by entering your credentials
                        again.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDisconnect}>
                        Disconnect
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          )}

          {/* Read-only notice for non-admins */}
          {!isAdmin && (
            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              You have read-only access to this page. Contact an administrator to modify the
              Shopify connection settings.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
