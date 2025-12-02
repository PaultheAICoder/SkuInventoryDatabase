'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
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
import { ReceiptDialog } from '@/components/features/ReceiptDialog'
import { AdjustmentDialog } from '@/components/features/AdjustmentDialog'
import { ArrowLeft, Edit, Package, Plus, Minus } from 'lucide-react'
import type { ComponentDetailResponse } from '@/types/component'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function ComponentDetailPage({ params }: PageProps) {
  const { id } = use(params)
  const router = useRouter()
  const { data: session } = useSession()
  const [component, setComponent] = useState<ComponentDetailResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false)
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false)

  const fetchComponent = async () => {
    try {
      const res = await fetch(`/api/components/${id}`)
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Component not found')
        }
        throw new Error('Failed to load component')
      }
      const { data } = await res.json()
      setComponent(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchComponent()
  }, [id])

  const getReorderBadgeVariant = (status: string) => {
    switch (status) {
      case 'critical':
        return 'critical'
      case 'warning':
        return 'warning'
      case 'ok':
        return 'success'
      default:
        return 'secondary'
    }
  }

  const canEdit = session?.user?.role !== 'viewer'

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (error || !component) {
    return (
      <div className="space-y-6">
        <Link href="/components">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Components
          </Button>
        </Link>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {error || 'Component not found'}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/components">
            <Button variant="ghost" size="sm" className="mb-2">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Components
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <Package className="h-8 w-8 text-muted-foreground" />
            <div>
              <h1 className="text-3xl font-bold">{component.name}</h1>
              <p className="font-mono text-muted-foreground">{component.skuCode}</p>
            </div>
            <Badge variant={getReorderBadgeVariant(component.reorderStatus)}>
              {component.reorderStatus.toUpperCase()}
            </Badge>
          </div>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setReceiptDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Record Receipt
            </Button>
            <Button variant="outline" onClick={() => setAdjustmentDialogOpen(true)}>
              <Minus className="mr-2 h-4 w-4" />
              Adjust
            </Button>
            <Link href={`/components/${id}/edit`}>
              <Button>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Component Details */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Inventory</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Quantity on Hand</p>
                <p className="text-3xl font-bold">{component.quantityOnHand.toLocaleString()}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Reorder Point</p>
                  <p className="text-lg font-medium">{component.reorderPoint}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Lead Time</p>
                  <p className="text-lg font-medium">{component.leadTimeDays} days</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Costing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Cost per Unit</p>
                <p className="text-3xl font-bold">
                  ${parseFloat(component.costPerUnit).toFixed(4)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Inventory Value</p>
                <p className="text-lg font-medium">
                  $
                  {(component.quantityOnHand * parseFloat(component.costPerUnit)).toLocaleString(
                    undefined,
                    { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Category</p>
                <p className="text-lg font-medium capitalize">{component.category || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Unit of Measure</p>
                <p className="text-lg font-medium capitalize">{component.unitOfMeasure}</p>
              </div>
              {component.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">Notes</p>
                  <p className="text-sm">{component.notes}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Used in SKUs */}
      {component.usedInSkus && component.usedInSkus.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Used in SKUs</CardTitle>
            <CardDescription>This component is used in the following SKU BOMs</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU Name</TableHead>
                  <TableHead className="text-right">Qty per Unit</TableHead>
                  <TableHead className="text-right">Buildable Units</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {component.usedInSkus.map((sku) => (
                  <TableRow key={sku.id}>
                    <TableCell>
                      <Link href={`/skus/${sku.id}`} className="hover:underline">
                        {sku.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {parseFloat(sku.quantityPerUnit).toFixed(4)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {sku.maxBuildableUnits != null ? (
                        <span className={sku.maxBuildableUnits === 0 ? 'text-red-600' : ''}>
                          {sku.maxBuildableUnits.toLocaleString()}
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Constrained SKUs */}
      {component.constrainedSkus && component.constrainedSkus.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50/50">
          <CardHeader>
            <CardTitle className="text-yellow-800">Constrained SKUs</CardTitle>
            <CardDescription>
              This component is limiting production capacity for these SKUs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU Name</TableHead>
                  <TableHead className="text-right">Qty per Unit</TableHead>
                  <TableHead className="text-right">Max Buildable</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {component.constrainedSkus.map((sku) => (
                  <TableRow key={sku.id}>
                    <TableCell>
                      <Link href={`/skus/${sku.id}`} className="hover:underline">
                        {sku.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {parseFloat(sku.quantityPerUnit).toFixed(4)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      <span className={sku.maxBuildableUnits === 0 ? 'text-red-600' : 'text-yellow-700'}>
                        {sku.maxBuildableUnits.toLocaleString()}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Recent Transactions */}
      {component.recentTransactions && component.recentTransactions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
            <CardDescription>Last 10 inventory changes for this component</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Quantity Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {component.recentTransactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>{new Date(tx.date).toLocaleDateString()}</TableCell>
                    <TableCell className="capitalize">{tx.type}</TableCell>
                    <TableCell
                      className={`text-right font-mono ${
                        parseFloat(tx.quantityChange) >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {parseFloat(tx.quantityChange) >= 0 ? '+' : ''}
                      {parseFloat(tx.quantityChange).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-4">
              <Link href={`/transactions?componentId=${component.id}`}>
                <Button variant="outline" size="sm">
                  View All Transactions
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      <ReceiptDialog
        open={receiptDialogOpen}
        onOpenChange={(open) => {
          setReceiptDialogOpen(open)
          if (!open) fetchComponent()
        }}
        componentId={component.id}
        componentName={component.name}
        currentCost={component.costPerUnit}
      />
      <AdjustmentDialog
        open={adjustmentDialogOpen}
        onOpenChange={(open) => {
          setAdjustmentDialogOpen(open)
          if (!open) fetchComponent()
        }}
        componentId={component.id}
        componentName={component.name}
        currentQuantity={component.quantityOnHand}
      />
    </div>
  )
}
