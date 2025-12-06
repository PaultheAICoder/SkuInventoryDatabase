'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ShoppingBag, Tag, ShoppingCart } from 'lucide-react'

/**
 * Integrations Hub Page
 * [V2-DEFERRED] All integrations are deferred to V2 per PRD requirements.
 * This page shows placeholders for future integration capabilities.
 */
export default function IntegrationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Integrations</h1>
        <p className="text-muted-foreground">
          Connect external platforms to sync inventory and orders
        </p>
      </div>

      {/* V2 Notice Banner */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
        <p className="text-sm text-blue-800">
          <strong>Coming in V2:</strong> Integration features including Shopify, Amazon, and TikTok
          connections will be available in the next major version. Check back for updates!
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Shopify Card - Coming in V2 */}
        <Card className="opacity-50 h-full">
          <CardHeader>
            <div className="flex items-center justify-between">
              <ShoppingBag className="h-8 w-8 text-muted-foreground" />
              <Badge variant="secondary">Coming in V2</Badge>
            </div>
            <CardTitle className="text-muted-foreground">Shopify</CardTitle>
            <CardDescription>Sync orders and products from your Shopify store</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Shopify integration will be available in V2.
            </p>
          </CardContent>
        </Card>

        {/* SKU Mappings Card - Coming in V2 */}
        <Card className="opacity-50 h-full">
          <CardHeader>
            <div className="flex items-center justify-between">
              <Tag className="h-8 w-8 text-muted-foreground" />
              <Badge variant="secondary">Coming in V2</Badge>
            </div>
            <CardTitle className="text-muted-foreground">SKU Mappings</CardTitle>
            <CardDescription>Map external product IDs to internal SKUs</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Channel mapping configuration will be available in V2.
            </p>
          </CardContent>
        </Card>

        {/* Amazon Card - Coming in V2 */}
        <Card className="opacity-50 h-full">
          <CardHeader>
            <div className="flex items-center justify-between">
              <ShoppingCart className="h-8 w-8 text-muted-foreground" />
              <Badge variant="secondary">Coming in V2</Badge>
            </div>
            <CardTitle className="text-muted-foreground">Amazon</CardTitle>
            <CardDescription>Sync with Amazon Seller Central</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Amazon integration will be available in V2.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
