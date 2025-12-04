'use client'

import Link from 'next/link'
import { Clock } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface ExpiringLot {
  id: string
  lotNumber: string
  componentId: string
  componentName: string
  componentSkuCode: string
  expiryDate: string
  balance: number
  daysUntilExpiry: number
}

interface ExpiryWarningBannerProps {
  expiringLots: ExpiringLot[]
  expiringCount: number
  expiredCount: number
  warningDays: number
  compact?: boolean
}

export function ExpiryWarningBanner({
  expiringLots,
  expiringCount,
  expiredCount,
  warningDays,
  compact = false,
}: ExpiryWarningBannerProps) {
  const hasWarnings = expiringCount > 0 || expiredCount > 0

  if (!hasWarnings) return null

  if (compact) {
    return (
      <div className="rounded-md bg-orange-50 border border-orange-200 p-3">
        <div className="flex items-start gap-2">
          <Clock className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-orange-800">
              Lot Expiry Warnings
            </p>
            <p className="text-sm text-orange-700 mt-1">
              {expiredCount > 0 && (
                <span className="font-medium text-red-600">
                  {expiredCount} expired lot{expiredCount !== 1 ? 's' : ''}
                </span>
              )}
              {expiredCount > 0 && expiringCount > 0 && ', '}
              {expiringCount > 0 && (
                <span>
                  {expiringCount} lot{expiringCount !== 1 ? 's' : ''} expiring within {warningDays} days
                </span>
              )}
            </p>
            <Link href="/lots?status=expiring_soon" className="text-sm text-orange-600 hover:underline mt-1 inline-block">
              View lots
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Card className="border-orange-200 bg-orange-50/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-orange-800">
          <Clock className="h-5 w-5" />
          Lot Expiry Warnings
        </CardTitle>
        <CardDescription>
          {expiredCount > 0 && (
            <span className="text-red-600 font-medium">
              {expiredCount} expired
              {expiringCount > 0 && ', '}
            </span>
          )}
          {expiringCount > 0 && (
            <span className="text-orange-600 font-medium">
              {expiringCount} expiring soon
            </span>
          )}
          {' '}requiring attention
        </CardDescription>
      </CardHeader>
      <CardContent>
        {expiringLots.length > 0 && (
          <div className="space-y-2">
            {expiringLots.slice(0, 5).map((lot) => (
              <div key={lot.id} className="flex items-center justify-between text-sm">
                <div>
                  <Link
                    href={`/lots/${lot.id}`}
                    className="font-medium hover:underline"
                  >
                    {lot.lotNumber}
                  </Link>
                  <span className="text-muted-foreground ml-2">
                    ({lot.componentName})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono" suppressHydrationWarning>
                    {lot.balance.toLocaleString()} units
                  </span>
                  <span className={`text-sm ${lot.daysUntilExpiry <= 7 ? 'text-red-600 font-medium' : 'text-orange-600'}`}>
                    {lot.daysUntilExpiry} days
                  </span>
                </div>
              </div>
            ))}
            {expiringLots.length > 5 && (
              <p className="text-sm text-muted-foreground">
                +{expiringLots.length - 5} more lots
              </p>
            )}
          </div>
        )}
        <div className="mt-4 flex gap-2">
          {expiredCount > 0 && (
            <Link href="/lots?status=expired">
              <Button variant="outline" size="sm" className="text-red-600 border-red-200">
                View {expiredCount} Expired
              </Button>
            </Link>
          )}
          <Link href="/lots?status=expiring_soon">
            <Button variant="outline" size="sm">
              View All Expiring
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
