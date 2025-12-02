'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowLeft, Edit, Package, Hammer } from 'lucide-react'
import { BOMVersionList } from '@/components/features/BOMVersionList'
import { BuildDialog } from '@/components/features/BuildDialog'
import { BuildableUnitsDisplay } from '@/components/features/BuildableUnitsDisplay'
import type { SKUDetailResponse } from '@/types/sku'
import type { BOMVersionResponse } from '@/types/bom'

export default function SKUDetailPage() {
  const router = useRouter()
  const params = useParams()
  const skuId = params.id as string
  const { data: session } = useSession()
  const [sku, setSku] = useState<SKUDetailResponse | null>(null)
  const [bomVersions, setBomVersions] = useState<BOMVersionResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [buildDialogOpen, setBuildDialogOpen] = useState(false)

  const canEdit = session?.user?.role !== 'viewer'

  const fetchData = useCallback(async () => {
    if (!skuId) return

    try {
      const [skuRes, bomRes] = await Promise.all([
        fetch(`/api/skus/${skuId}`),
        fetch(`/api/skus/${skuId}/bom-versions?includeInactive=true`),
      ])

      if (!skuRes.ok) {
        throw new Error('SKU not found')
      }

      const skuData = await skuRes.json()
      setSku(skuData.data)

      if (bomRes.ok) {
        const bomData = await bomRes.json()
        setBomVersions(bomData.data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load SKU')
    } finally {
      setIsLoading(false)
    }
  }, [skuId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleRefresh = () => {
    fetchData()
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>
        <p>Loading...</p>
      </div>
    )
  }

  if (error || !sku) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>
        <p className="text-red-500">{error || 'SKU not found'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{sku.name}</h1>
            <p className="text-muted-foreground font-mono">{sku.internalCode}</p>
          </div>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            {sku.activeBom && (
              <Button onClick={() => setBuildDialogOpen(true)}>
                <Hammer className="h-4 w-4 mr-2" />
                Build
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href={`/skus/${skuId}/edit`}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Link>
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* SKU Details */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              SKU Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Sales Channel</p>
              <Badge variant="outline" className="mt-1">
                {sku.salesChannel}
              </Badge>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge variant={sku.isActive ? 'success' : 'secondary'} className="mt-1">
                {sku.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>

            {sku.activeBom && (
              <>
                <div>
                  <p className="text-sm text-muted-foreground">Active BOM</p>
                  <p className="font-medium">{sku.activeBom.versionName}</p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Unit Cost</p>
                  <p className="font-mono text-lg">
                    ${parseFloat(sku.activeBom.unitCost).toFixed(2)}
                  </p>
                </div>
              </>
            )}

            <div>
              <p className="text-sm text-muted-foreground">Max Buildable Units</p>
              <BuildableUnitsDisplay
                maxBuildableUnits={sku.maxBuildableUnits}
                size="lg"
              />
            </div>

            {Object.keys(sku.externalIds).length > 0 && (
              <div>
                <p className="text-sm text-muted-foreground">External IDs</p>
                <div className="space-y-1 mt-1">
                  {Object.entries(sku.externalIds).map(([key, value]) => (
                    <div key={key} className="text-sm">
                      <span className="text-muted-foreground capitalize">{key}:</span>{' '}
                      <span className="font-mono">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sku.notes && (
              <div>
                <p className="text-sm text-muted-foreground">Notes</p>
                <p className="text-sm mt-1">{sku.notes}</p>
              </div>
            )}

            <div className="text-xs text-muted-foreground pt-4 border-t">
              <p>Created: {new Date(sku.createdAt).toLocaleDateString()}</p>
              <p>Updated: {new Date(sku.updatedAt).toLocaleDateString()}</p>
            </div>
          </CardContent>
        </Card>

        {/* BOM Versions */}
        <div className="lg:col-span-2">
          {skuId && (
            <BOMVersionList
              versions={bomVersions}
              skuId={skuId}
              onRefresh={handleRefresh}
            />
          )}
        </div>
      </div>

      {/* Recent Transactions */}
      {sku.recentTransactions && sku.recentTransactions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
            <CardDescription>Last 10 build transactions for this SKU</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Units Built</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sku.recentTransactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>{new Date(tx.date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {tx.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-green-600">
                      {tx.unitsBuild !== null ? `+${tx.unitsBuild.toLocaleString()}` : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-4">
              <Link href={`/transactions?skuId=${sku.id}`}>
                <Button variant="outline" size="sm">
                  View All Transactions
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Build Dialog */}
      {skuId && (
        <BuildDialog
          open={buildDialogOpen}
          onOpenChange={(open) => {
            setBuildDialogOpen(open)
            if (!open) handleRefresh()
          }}
          preselectedSkuId={skuId}
        />
      )}
    </div>
  )
}
