'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ShoppingBag, ExternalLink, Tag } from 'lucide-react'
import { useEffect, useState } from 'react'

type ConnectionStatus = 'loading' | 'connected' | 'disconnected'

export default function IntegrationsPage() {
  const [shopifyStatus, setShopifyStatus] = useState<ConnectionStatus>('loading')

  useEffect(() => {
    fetch('/api/shopify/connection')
      .then((res) => {
        if (res.status === 403) {
          // User doesn't have permission
          setShopifyStatus('disconnected')
          return null
        }
        return res.json()
      })
      .then((data) => {
        if (data) {
          setShopifyStatus(data.data?.isActive ? 'connected' : 'disconnected')
        }
      })
      .catch(() => setShopifyStatus('disconnected'))
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Integrations</h1>
        <p className="text-muted-foreground">
          Connect external platforms to sync inventory and orders
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Shopify Connection Card */}
        <Link href="/settings/integrations/shopify">
          <Card className="hover:border-primary transition-colors cursor-pointer h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <ShoppingBag className="h-8 w-8 text-green-600" />
                <Badge variant={shopifyStatus === 'connected' ? 'default' : 'secondary'}>
                  {shopifyStatus === 'loading'
                    ? '...'
                    : shopifyStatus === 'connected'
                      ? 'Connected'
                      : 'Not Connected'}
                </Badge>
              </div>
              <CardTitle className="flex items-center gap-2">
                Shopify
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </CardTitle>
              <CardDescription>
                Sync orders and products from your Shopify store
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        {/* SKU Mappings Card */}
        <Link href="/settings/integrations/mappings">
          <Card className="hover:border-primary transition-colors cursor-pointer h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <Tag className="h-8 w-8 text-blue-600" />
                <Badge variant="outline">Configuration</Badge>
              </div>
              <CardTitle className="flex items-center gap-2">
                SKU Mappings
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </CardTitle>
              <CardDescription>
                Map external product IDs to internal SKUs
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        {/* Placeholder for future integrations */}
        <Card className="opacity-50 h-full">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="h-8 w-8 rounded bg-muted" />
              <Badge variant="secondary">Coming Soon</Badge>
            </div>
            <CardTitle className="text-muted-foreground">Amazon</CardTitle>
            <CardDescription>Sync with Amazon Seller Central</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Amazon integration will be available in a future update.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
