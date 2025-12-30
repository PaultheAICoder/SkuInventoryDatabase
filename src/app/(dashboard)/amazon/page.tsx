'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Construction } from 'lucide-react'

export default function AmazonPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Amazon</h1>
        <p className="text-muted-foreground">Amazon Seller Central integration</p>
      </div>

      <Card className="max-w-md mx-auto mt-12">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Construction className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle>Coming Soon</CardTitle>
          <CardDescription>
            Amazon Seller Central integration is currently in development.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          <p>This feature will allow you to:</p>
          <ul className="mt-2 space-y-1">
            <li>Sync orders from Amazon</li>
            <li>Track FBA inventory levels</li>
            <li>View sales analytics</li>
            <li>Manage product listings</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
