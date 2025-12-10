'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DashboardStats } from '@/components/features/DashboardStats'
import { CriticalComponentsList } from '@/components/features/CriticalComponentsList'
import { TopBuildableSkusList } from '@/components/features/TopBuildableSkusList'
import { DashboardTimeFilter } from '@/components/features/DashboardTimeFilter'
import { LocationFilter } from '@/components/features/LocationFilter'
import { ExpiryWarningBanner } from '@/components/features/ExpiryWarningBanner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDateString } from '@/lib/utils'
import type { ReorderStatus } from '@/types'

interface DashboardData {
  componentStats: {
    total: number
    critical: number
    warning: number
    ok: number
  }
  criticalComponents: Array<{
    id: string
    name: string
    skuCode: string
    quantityOnHand: number
    reorderPoint: number
    leadTimeDays: number
    reorderStatus: ReorderStatus
  }>
  topBuildableSkus: Array<{
    id: string
    name: string
    internalCode: string
    maxBuildableUnits: number
    unitCost: string
  }>
  recentTransactions: Array<{
    id: string
    type: string
    date: string
    createdAt: string
    createdBy: { id: string; name: string }
    lines: Array<{
      component: { id: string; name: string }
      quantityChange: string
    }>
  }>
}

interface ExpiryData {
  expiringLots: Array<{
    id: string
    lotNumber: string
    componentId: string
    componentName: string
    componentSkuCode: string
    expiryDate: string
    balance: number
    daysUntilExpiry: number
  }>
  expiringCount: number
  expiredCount: number
  warningDays: number
}

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const [data, setData] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeFilter, setTimeFilter] = useState<number | null>(30)
  const [locationId, setLocationId] = useState<string | undefined>(undefined)
  const [expiryData, setExpiryData] = useState<ExpiryData | null>(null)

  // Refetch when company changes, time filter changes, or location changes
  useEffect(() => {
    async function fetchDashboard() {
      try {
        setIsLoading(true)
        let url = timeFilter ? `/api/dashboard?days=${timeFilter}` : '/api/dashboard'
        if (locationId) {
          url += `${url.includes('?') ? '&' : '?'}locationId=${locationId}`
        }
        const res = await fetch(url)
        if (!res.ok) {
          throw new Error('Failed to load dashboard')
        }
        const result = await res.json()
        setData(result.data)

        // Fetch expiry data (non-blocking)
        try {
          const expiryRes = await fetch('/api/lots/expiring')
          if (expiryRes.ok) {
            const expiryResult = await expiryRes.json()
            setExpiryData(expiryResult.data)
          }
        } catch {
          // Silently fail - expiry warning is non-critical
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setIsLoading(false)
      }
    }

    // Don't fetch while session is loading
    if (status === 'loading') return

    if (session?.user?.selectedCompanyId) {
      fetchDashboard()
    }
  }, [status, timeFilter, locationId, session?.user?.selectedCompanyId, session?.user?.selectedBrandId])

  if (status === 'loading' || isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-red-500">{error || 'Failed to load data'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Welcome to the Inventory & BOM Tracker</p>
        </div>
        <div className="flex gap-2">
          <LocationFilter value={locationId} onValueChange={setLocationId} />
          <DashboardTimeFilter value={timeFilter} onChange={setTimeFilter} />
        </div>
      </div>

      <DashboardStats stats={data.componentStats} />

      {expiryData && (expiryData.expiringCount > 0 || expiryData.expiredCount > 0) && (
        <ExpiryWarningBanner
          expiringLots={expiryData.expiringLots}
          expiringCount={expiryData.expiringCount}
          expiredCount={expiryData.expiredCount}
          warningDays={expiryData.warningDays}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <CriticalComponentsList components={data.criticalComponents} />
        <TopBuildableSkusList skus={data.topBuildableSkus} />
      </div>

      <div className="grid gap-6 lg:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
            <CardDescription>Latest inventory activity</CardDescription>
          </CardHeader>
          <CardContent>
            {data.recentTransactions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent transactions</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Component</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentTransactions.slice(0, 5).map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="font-mono text-sm" suppressHydrationWarning>
                        {formatDateString(tx.date)}
                      </TableCell>
                      <TableCell className="capitalize">{tx.type}</TableCell>
                      <TableCell>
                        {tx.lines[0] && (
                          <Link
                            href={`/components/${tx.lines[0].component.id}`}
                            className="hover:underline"
                          >
                            {tx.lines[0].component.name}
                          </Link>
                        )}
                        {tx.lines.length > 1 && (
                          <span className="text-muted-foreground">
                            {' '}
                            +{tx.lines.length - 1} more
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {tx.lines[0] && (
                          <span
                            className={`font-mono ${
                              parseFloat(tx.lines[0].quantityChange) >= 0
                                ? 'text-green-600'
                                : 'text-red-600'
                            }`}
                            suppressHydrationWarning
                          >
                            {parseFloat(tx.lines[0].quantityChange) >= 0 ? '+' : ''}
                            {parseFloat(tx.lines[0].quantityChange).toLocaleString()}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {data.recentTransactions.length > 0 && (
              <div className="mt-4">
                <Link
                  href="/transactions"
                  className="text-sm text-muted-foreground hover:underline"
                >
                  View all transactions
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
