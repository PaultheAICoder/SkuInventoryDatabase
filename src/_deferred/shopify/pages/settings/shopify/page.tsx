'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { ShopifyConnectionForm } from '@/components/features/ShopifyConnectionForm'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import type { ConnectionResponse } from '@/types/shopify-connection'

export default function ShopifySettingsPage() {
  const { data: session } = useSession()
  const [connection, setConnection] = useState<ConnectionResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchConnection = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/shopify/connection')
      if (res.status === 403) {
        setError('You do not have permission to view Shopify settings')
        return
      }
      if (!res.ok) {
        throw new Error('Failed to load connection')
      }
      const data = await res.json()
      setConnection(data.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (session?.user?.selectedCompanyId) {
      fetchConnection()
    }
  }, [session?.user?.selectedCompanyId, fetchConnection])

  const isAdmin = session?.user?.role === 'admin'

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/settings/integrations">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Shopify Settings</h1>
            <p className="text-muted-foreground">Configure your Shopify store connection</p>
          </div>
        </div>
        <div className="py-10 text-center text-muted-foreground">Loading connection...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/settings/integrations">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Shopify Settings</h1>
            <p className="text-muted-foreground">Configure your Shopify store connection</p>
          </div>
        </div>
        <div className="rounded-md bg-destructive/10 p-4 text-destructive">{error}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings/integrations">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Shopify Settings</h1>
          <p className="text-muted-foreground">Configure your Shopify store connection</p>
        </div>
      </div>

      <div className="max-w-2xl">
        <ShopifyConnectionForm
          connection={connection}
          isAdmin={isAdmin}
          onRefresh={fetchConnection}
        />
      </div>
    </div>
  )
}
