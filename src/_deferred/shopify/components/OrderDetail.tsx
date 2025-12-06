'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Textarea } from '@/components/ui/textarea'
import { ShoppingCart, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { LineMappingDialog } from './LineMappingDialog'
import { ORDER_STATUS_CONFIG, type OrderStatusKey } from '@/types/order-review'
import type { OrderResponse, OrderLineResponse } from '@/types/shopify-sync'

interface OrderDetailProps {
  order: OrderResponse
  onRefresh: () => void
}

export function OrderDetail({ order, onRefresh }: OrderDetailProps) {
  const [isApproving, setIsApproving] = useState(false)
  const [isSkipping, setIsSkipping] = useState(false)
  const [showSkipDialog, setShowSkipDialog] = useState(false)
  const [skipReason, setSkipReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [selectedLine, setSelectedLine] = useState<OrderLineResponse | null>(null)

  const statusConfig = ORDER_STATUS_CONFIG[order.status as OrderStatusKey]
  const canTakeAction = order.status === 'pending' || order.status === 'error'
  const hasUnmappedLines = order.lines.some(
    (l) => l.shopifyVariantId && l.mappingStatus !== 'mapped'
  )

  const handleApprove = async () => {
    setIsApproving(true)
    setError(null)

    try {
      const res = await fetch(`/api/shopify/orders/${order.id}/approve`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to approve order')
      }

      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsApproving(false)
    }
  }

  const handleSkip = async () => {
    setIsSkipping(true)
    setError(null)

    try {
      const res = await fetch(`/api/shopify/orders/${order.id}/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: skipReason || undefined }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to skip order')
      }

      setShowSkipDialog(false)
      setSkipReason('')
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsSkipping(false)
    }
  }

  const getMappingBadge = (line: OrderLineResponse) => {
    if (!line.shopifyVariantId) {
      return <Badge variant="secondary">Custom</Badge>
    }
    switch (line.mappingStatus) {
      case 'mapped':
        return <Badge variant="success">Mapped</Badge>
      case 'unmapped':
        return <Badge variant="warning">Unmapped</Badge>
      case 'not_found':
        return <Badge variant="critical">Not Found</Badge>
      default:
        return <Badge variant="secondary">Unknown</Badge>
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-destructive/10 p-4 text-destructive">{error}</div>
      )}

      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <ShoppingCart className="h-8 w-8 text-muted-foreground" />
              <div>
                <CardTitle className="flex items-center gap-2">
                  Order {order.shopifyOrderNumber}
                  <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                </CardTitle>
                <CardDescription>Shopify Order ID: {order.shopifyOrderId}</CardDescription>
              </div>
            </div>
            {canTakeAction && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowSkipDialog(true)}
                  disabled={isApproving || isSkipping}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Skip
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={isApproving || isSkipping || hasUnmappedLines}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  {isApproving ? 'Approving...' : 'Approve'}
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">Order Date</p>
              <p className="font-medium" suppressHydrationWarning>
                {new Date(order.orderDate).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Fulfillment Status</p>
              <p className="font-medium capitalize">{order.fulfillmentStatus || 'Unfulfilled'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Financial Status</p>
              <p className="font-medium capitalize">{order.financialStatus || 'Pending'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Synced At</p>
              <p className="font-medium" suppressHydrationWarning>
                {new Date(order.syncedAt).toLocaleString()}
              </p>
            </div>
          </div>

          {order.errorMessage && order.status === 'skipped' && (
            <div className="mt-4 rounded-md bg-muted p-3">
              <p className="text-sm text-muted-foreground">Skip Reason</p>
              <p className="text-sm">{order.errorMessage}</p>
            </div>
          )}

          {hasUnmappedLines && canTakeAction && (
            <div className="mt-4 flex items-center gap-2 rounded-md bg-yellow-50 border border-yellow-200 p-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <p className="text-sm text-yellow-800">
                This order has unmapped line items. Map all items before approving.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Line Items Card */}
      <Card>
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
          <CardDescription>{order.lines.length} item(s) in this order</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Shopify SKU</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Mapping Status</TableHead>
                <TableHead>Mapped SKU</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="font-medium">{line.title}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {line.shopifySku || '-'}
                  </TableCell>
                  <TableCell className="text-right">{line.quantity}</TableCell>
                  <TableCell className="text-right font-mono">
                    ${parseFloat(line.price).toFixed(2)}
                  </TableCell>
                  <TableCell>{getMappingBadge(line)}</TableCell>
                  <TableCell>
                    {line.mappedSku ? (
                      <div>
                        <p className="font-medium">{line.mappedSku.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {line.mappedSku.internalCode}
                        </p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {line.shopifyVariantId && canTakeAction && (
                      <Button variant="ghost" size="sm" onClick={() => setSelectedLine(line)}>
                        {line.mappingStatus === 'mapped' ? 'Change' : 'Map'}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Skip Dialog */}
      <AlertDialog open={showSkipDialog} onOpenChange={setShowSkipDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skip Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to skip order {order.shopifyOrderNumber}? This order will not be
              processed for inventory transactions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium">Reason (optional)</label>
            <Textarea
              placeholder="Enter reason for skipping..."
              value={skipReason}
              onChange={(e) => setSkipReason(e.target.value)}
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSkip} disabled={isSkipping}>
              {isSkipping ? 'Skipping...' : 'Skip Order'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Line Mapping Dialog */}
      {selectedLine && (
        <LineMappingDialog
          open={!!selectedLine}
          onOpenChange={(open) => !open && setSelectedLine(null)}
          orderId={order.id}
          line={{
            id: selectedLine.id,
            title: selectedLine.title,
            shopifySku: selectedLine.shopifySku,
            quantity: selectedLine.quantity,
            mappedSkuId: selectedLine.mappedSkuId,
          }}
          onSuccess={onRefresh}
        />
      )}
    </div>
  )
}
