'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChevronLeft, ChevronRight, Filter } from 'lucide-react'
import { ExportButton } from '@/components/features/ExportButton'
import type { TransactionResponse } from '@/types/transaction'

const TRANSACTION_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'build', label: 'Build' },
  { value: 'initial', label: 'Initial' },
]

function TransactionLogContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [transactions, setTransactions] = useState<TransactionResponse[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const pageSize = parseInt(searchParams.get('pageSize') ?? '50', 10)
  const totalPages = Math.ceil(total / pageSize)

  const [filters, setFilters] = useState({
    type: searchParams.get('type') ?? '',
    componentId: searchParams.get('componentId') ?? '',
    skuId: searchParams.get('skuId') ?? '',
    dateFrom: searchParams.get('dateFrom') ?? '',
    dateTo: searchParams.get('dateTo') ?? '',
  })

  const updateFilters = (params: Record<string, string>) => {
    const newParams = new URLSearchParams(searchParams.toString())
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        newParams.set(key, value)
      } else {
        newParams.delete(key)
      }
    })
    if (!params.page) {
      newParams.set('page', '1')
    }
    router.push(`/transactions?${newParams.toString()}`)
  }

  const fetchTransactions = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      })
      if (filters.type) params.set('type', filters.type)
      if (filters.componentId) params.set('componentId', filters.componentId)
      if (filters.skuId) params.set('skuId', filters.skuId)
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
      if (filters.dateTo) params.set('dateTo', filters.dateTo)

      const res = await fetch(`/api/transactions?${params.toString()}`)
      if (!res.ok) {
        throw new Error('Failed to load transactions')
      }
      const result = await res.json()
      setTransactions(result.data)
      setTotal(result.meta.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchTransactions()
  }, [searchParams])

  const handleApplyFilters = () => {
    updateFilters(filters)
  }

  const handleClearFilters = () => {
    setFilters({
      type: '',
      componentId: '',
      skuId: '',
      dateFrom: '',
      dateTo: '',
    })
    router.push('/transactions')
  }

  const getTypeBadgeVariant = (type: string) => {
    switch (type) {
      case 'receipt':
        return 'success'
      case 'adjustment':
        return 'warning'
      case 'build':
        return 'default'
      case 'initial':
        return 'secondary'
      default:
        return 'outline'
    }
  }

  const formatTransactionSummary = (tx: TransactionResponse) => {
    switch (tx.type) {
      case 'receipt':
        return `Received from ${tx.supplier}`
      case 'adjustment':
        return tx.reason
      case 'build':
        return `Built ${tx.unitsBuild} × ${tx.sku?.name}`
      case 'initial':
        return 'Initial inventory'
      default:
        return '-'
    }
  }

  // Build export query params from current filters
  const exportQueryParams = {
    type: filters.type,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Transactions</h1>
          <p className="text-muted-foreground">View all inventory transactions</p>
        </div>
        <ExportButton exportType="transactions" queryParams={exportQueryParams} />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters</span>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Type</label>
              <Select
                value={filters.type}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, type: value }))}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  {TRANSACTION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Date From</label>
              <Input
                type="date"
                className="w-[150px]"
                value={filters.dateFrom}
                onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Date To</label>
              <Input
                type="date"
                className="w-[150px]"
                value={filters.dateTo}
                onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
              />
            </div>

            <div className="flex gap-2">
              <Button variant="secondary" onClick={handleApplyFilters}>
                Apply
              </Button>
              <Button variant="outline" onClick={handleClearFilters}>
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && (
        <Card>
          <CardContent className="py-10 text-center text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* Loading State */}
      {isLoading && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">Loading...</CardContent>
        </Card>
      )}

      {/* Transaction Table */}
      {!isLoading && !error && (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead>Components</TableHead>
                  <TableHead>Created By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      No transactions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions.map((tx) => (
                    <TableRow
                      key={tx.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/transactions/${tx.id}`)}
                    >
                      <TableCell className="font-mono text-sm">
                        {new Date(tx.date).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getTypeBadgeVariant(tx.type)}>{tx.type}</Badge>
                      </TableCell>
                      <TableCell>{formatTransactionSummary(tx)}</TableCell>
                      <TableCell>
                        {tx.lines.slice(0, 2).map((line, idx) => (
                          <div key={line.id} className="text-sm">
                            {idx > 0 && <span className="text-muted-foreground">, </span>}
                            <span className="font-medium">{line.component.name}</span>
                            <span
                              className={`ml-1 font-mono ${
                                parseFloat(line.quantityChange) >= 0
                                  ? 'text-green-600'
                                  : 'text-red-600'
                              }`}
                            >
                              {parseFloat(line.quantityChange) >= 0 ? '+' : ''}
                              {parseFloat(line.quantityChange).toLocaleString()}
                            </span>
                          </div>
                        ))}
                        {tx.lines.length > 2 && (
                          <span className="text-xs text-muted-foreground">
                            +{tx.lines.length - 2} more
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {tx.createdBy.name}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total}{' '}
                transactions
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateFilters({ page: (page - 1).toString() })}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateFilters({ page: (page + 1).toString() })}
                  disabled={page >= totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TransactionLogContent />
    </Suspense>
  )
}
