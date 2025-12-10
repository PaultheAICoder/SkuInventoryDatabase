'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
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
import { ArrowLeft, Package2, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatDateString } from '@/lib/utils'
import type { LotDetailResponse, LotTraceResponse, LotTransactionResponse, AffectedSkuResponse } from '@/types/lot'

export default function LotDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [lot, setLot] = useState<LotDetailResponse | null>(null)
  const [trace, setTrace] = useState<LotTraceResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [transactionPage, setTransactionPage] = useState(1)
  const transactionPageSize = 10

  const fetchLot = useCallback(async () => {
    try {
      const res = await fetch(`/api/lots/${id}`)
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Lot not found')
        }
        throw new Error('Failed to load lot')
      }
      const { data } = await res.json()
      setLot(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }, [id])

  const fetchTrace = useCallback(async () => {
    try {
      const res = await fetch(`/api/lots/${id}/trace?page=${transactionPage}&pageSize=${transactionPageSize}`)
      if (!res.ok) {
        throw new Error('Failed to load trace data')
      }
      const { data } = await res.json()
      setTrace(data)
    } catch (err) {
      console.error('Error fetching trace:', err)
      // Don't set error - trace is supplementary
    }
  }, [id, transactionPage])

  useEffect(() => {
    async function loadData() {
      setIsLoading(true)
      await fetchLot()
      await fetchTrace()
      setIsLoading(false)
    }
    loadData()
  }, [fetchLot, fetchTrace])

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'expired':
        return 'critical'
      case 'expiring_soon':
        return 'warning'
      case 'ok':
        return 'success'
      default:
        return 'secondary'
    }
  }

  const formatStatusLabel = (status: string) => {
    switch (status) {
      case 'expired':
        return 'EXPIRED'
      case 'expiring_soon':
        return 'EXPIRING SOON'
      case 'ok':
        return 'OK'
      default:
        return status.toUpperCase()
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (error || !lot) {
    return (
      <div className="space-y-6">
        <Link href="/lots">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Lots
          </Button>
        </Link>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {error || 'Lot not found'}
          </CardContent>
        </Card>
      </div>
    )
  }

  const totalTransactionPages = trace ? Math.ceil(trace.totalTransactions / transactionPageSize) : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/lots">
            <Button variant="ghost" size="sm" className="mb-2">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Lots
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <Package2 className="h-8 w-8 text-muted-foreground" />
            <div>
              <h1 className="text-3xl font-bold">{lot.lotNumber}</h1>
              <p className="text-muted-foreground">{lot.componentName}</p>
            </div>
            <Badge variant={getStatusBadgeVariant(lot.status)}>
              {formatStatusLabel(lot.status)}
            </Badge>
          </div>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Current Balance</p>
                <p className="text-3xl font-bold" suppressHydrationWarning>
                  {parseFloat(lot.balance).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Received Quantity</p>
                <p className="text-lg font-medium" suppressHydrationWarning>
                  {parseFloat(lot.receivedQuantity).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Component</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <Link
                  href={`/components/${lot.componentId}`}
                  className="text-lg font-medium hover:underline"
                >
                  {lot.componentName}
                </Link>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">SKU Code</p>
                <p className="text-lg font-mono">{lot.componentSkuCode}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Received Info</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Received Date</p>
                <p className="text-lg font-medium" suppressHydrationWarning>
                  {new Date(lot.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Expiry Date</p>
                <p className="text-lg font-medium" suppressHydrationWarning>
                  {lot.expiryDate ? formatDateString(lot.expiryDate) : '-'}
                </p>
              </div>
              {lot.supplier && (
                <div>
                  <p className="text-sm text-muted-foreground">Supplier</p>
                  <p className="text-lg font-medium">{lot.supplier}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {lot.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{lot.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Transaction History */}
      {trace && trace.transactions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
            <CardDescription>
              All inventory movements involving this lot ({trace.totalTransactions} total)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trace.transactions.map((tx: LotTransactionResponse) => (
                  <TableRow key={tx.id}>
                    <TableCell suppressHydrationWarning>
                      {formatDateString(tx.date)}
                    </TableCell>
                    <TableCell className="capitalize">{tx.type}</TableCell>
                    <TableCell
                      className={`text-right font-mono ${
                        parseFloat(tx.quantityChange) >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                      suppressHydrationWarning
                    >
                      {parseFloat(tx.quantityChange) >= 0 ? '+' : ''}
                      {parseFloat(tx.quantityChange).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {tx.skuName ? (
                        <Link href={`/skus/${tx.skuId}`} className="hover:underline">
                          {tx.skuName}
                        </Link>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell>{tx.locationName || '-'}</TableCell>
                    <TableCell>{tx.createdByName}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {totalTransactionPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Page {transactionPage} of {totalTransactionPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTransactionPage((p) => p - 1)}
                    disabled={transactionPage <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTransactionPage((p) => p + 1)}
                    disabled={transactionPage >= totalTransactionPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Affected SKUs */}
      {trace && trace.affectedSkus.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50/50">
          <CardHeader>
            <CardTitle className="text-yellow-800">Affected SKUs</CardTitle>
            <CardDescription>
              SKUs that were built using components from this lot
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU Name</TableHead>
                  <TableHead>Internal Code</TableHead>
                  <TableHead className="text-right">Quantity Used</TableHead>
                  <TableHead className="text-right">Transactions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trace.affectedSkus.map((sku: AffectedSkuResponse) => (
                  <TableRow key={sku.id}>
                    <TableCell>
                      <Link href={`/skus/${sku.id}`} className="hover:underline">
                        {sku.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono">{sku.internalCode}</TableCell>
                    <TableCell className="text-right font-mono" suppressHydrationWarning>
                      {parseFloat(sku.quantityUsed).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">{sku.transactionCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
