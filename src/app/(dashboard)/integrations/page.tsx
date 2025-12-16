'use client'

/**
 * Integrations Management Page
 *
 * Allows users to manage external service connections (Amazon Ads, Shopify, etc.)
 * and upload CSV files for keyword/search term data.
 */

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { AmazonAdsCard } from '@/components/integrations/amazon-ads-card'
import { ShopifyCard } from '@/components/integrations/shopify-card'
import { SyncHistory } from '@/components/integrations/sync-history'
import { CsvUpload } from '@/components/integrations/csv-upload'
import { AsinMappingList } from '@/components/integrations/asin-mapping-list'
import { AlertCircle, CheckCircle } from 'lucide-react'

interface Brand {
  id: string
  name: string
}

export default function IntegrationsPage() {
  const { data: session, status } = useSession()
  const searchParams = useSearchParams()
  const [notification, setNotification] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const [brands, setBrands] = useState<Brand[]>([])

  // Fetch brands for CSV upload
  useEffect(() => {
    async function fetchBrands() {
      try {
        const res = await fetch('/api/brands')
        if (res.ok) {
          const data = await res.json()
          setBrands(data.data || [])
        }
      } catch {
        // Brands are optional for CSV upload
      }
    }
    fetchBrands()
  }, [])

  // Handle callback status from OAuth flows
  useEffect(() => {
    const statusParam = searchParams.get('status')
    const errorParam = searchParams.get('error')
    const typeParam = searchParams.get('type')

    if (statusParam === 'connected') {
      const serviceName = typeParam === 'shopify' ? 'Shopify store' : 'Amazon Ads account'
      setNotification({
        type: 'success',
        message: `${serviceName} connected successfully!`,
      })
    } else if (errorParam) {
      setNotification({
        type: 'error',
        message: decodeURIComponent(errorParam),
      })
    }

    // Clear notification after 5 seconds
    if (statusParam || errorParam) {
      const timer = setTimeout(() => setNotification(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [searchParams])

  const handleSync = async (credentialId: string) => {
    try {
      const response = await fetch('/api/integrations/amazon-ads/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credentialId,
          syncType: 'full',
          dateRange: {
            startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            endDate: new Date().toISOString().split('T')[0],
          },
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Sync failed')
      }

      setNotification({
        type: 'success',
        message: 'Sync started. This may take a few minutes.',
      })
    } catch (error) {
      setNotification({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to start sync',
      })
    }
  }

  if (status === 'loading') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Integrations</h1>
          <p className="text-muted-foreground">Manage external service connections</p>
        </div>
        <div className="py-10 text-center text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const isAdmin = session?.user?.role === 'admin'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Integrations</h1>
        <p className="text-muted-foreground">
          Connect external services to import advertising and sales data.
        </p>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          className={`flex items-center gap-2 rounded-md p-4 ${
            notification.type === 'success'
              ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle className="h-5 w-5" />
          ) : (
            <AlertCircle className="h-5 w-5" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Integration Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        <AmazonAdsCard isAdmin={isAdmin} onSync={handleSync} />
        <ShopifyCard isAdmin={isAdmin} />
      </div>

      {/* ASIN Mapping Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">ASIN Mappings</h2>
        <AsinMappingList brands={brands} isAdmin={isAdmin} />
      </div>

      {/* CSV Upload Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Manual Data Upload</h2>
        <CsvUpload brands={brands} />
      </div>

      {/* Sync History */}
      <SyncHistory limit={10} />

      {/* Help Text */}
      <div className="rounded-lg border p-4 text-sm text-muted-foreground">
        <h3 className="font-medium text-foreground mb-2">About Integrations</h3>
        <ul className="list-disc list-inside space-y-1">
          <li>Amazon Ads: Import campaign, portfolio, and keyword performance data</li>
          <li>Shopify: Sync order data for sales attribution (read-only access)</li>
          <li>ASIN Mapping: Link Amazon ASINs to internal SKUs for sales attribution</li>
          <li>CSV/XLSX Upload: Manually import keyword data from Amazon, ZonGuru, or Helium10</li>
          <li>Only admins can connect or disconnect integrations</li>
          <li>Data syncs automatically daily, or manually trigger with Sync Now</li>
        </ul>
      </div>
    </div>
  )
}
