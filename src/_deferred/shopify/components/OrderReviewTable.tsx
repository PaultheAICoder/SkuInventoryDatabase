'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, ChevronLeft, ChevronRight, Eye, AlertCircle } from 'lucide-react'
import { ORDER_STATUS_CONFIG, type OrderStatusKey } from '@/types/order-review'
import { formatDateString } from '@/lib/utils'
import type { OrderResponse } from '@/types/shopify-sync'

interface OrderReviewTableProps {
  orders: OrderResponse[]
  total: number
  page: number
  pageSize: number
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'posted', label: 'Posted' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'error', label: 'Error' },
]

const UNMAPPED_OPTIONS = [
  { value: 'all', label: 'All Orders' },
  { value: 'true', label: 'Has Unmapped' },
  { value: 'false', label: 'Fully Mapped' },
]

export function OrderReviewTable({ orders, total, page, pageSize }: OrderReviewTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('search') ?? '')

  const totalPages = Math.ceil(total / pageSize)

  const updateFilters = (params: Record<string, string>) => {
    const newParams = new URLSearchParams(searchParams.toString())
    Object.entries(params).forEach(([key, value]) => {
      if (value && value !== 'all') {
        newParams.set(key, value)
      } else {
        newParams.delete(key)
      }
    })
    if (!params.page) {
      newParams.set('page', '1')
    }
    router.push(`/orders?${newParams.toString()}`)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    updateFilters({ search })
  }

  const getStatusBadge = (status: string) => {
    const config = ORDER_STATUS_CONFIG[status as OrderStatusKey]
    return config ? (
      <Badge variant={config.variant}>{config.label}</Badge>
    ) : (
      <Badge variant="secondary">{status}</Badge>
    )
  }

  const getUnmappedCount = (order: OrderResponse) => {
    return order.lines.filter((l) => l.shopifyVariantId && l.mappingStatus !== 'mapped').length
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search orders..."
              className="pl-8 w-[250px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>

        <div className="flex gap-2">
          <Select
            value={searchParams.get('status') || 'all'}
            onValueChange={(value) => updateFilters({ status: value })}
          >
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={searchParams.get('hasUnmappedLines') || 'all'}
            onValueChange={(value) => updateFilters({ hasUnmappedLines: value })}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Mapping" />
            </SelectTrigger>
            <SelectContent>
              {UNMAPPED_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Mapping</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No orders found.
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => {
                const unmappedCount = getUnmappedCount(order)
                return (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Link href={`/orders/${order.id}`} className="font-medium hover:underline">
                        {order.shopifyOrderNumber}
                      </Link>
                      <div className="text-xs text-muted-foreground font-mono">
                        {order.shopifyOrderId.slice(0, 12)}...
                      </div>
                    </TableCell>
                    <TableCell suppressHydrationWarning>
                      {formatDateString(order.orderDate)}
                    </TableCell>
                    <TableCell className="text-right">{order.lines.length}</TableCell>
                    <TableCell>{getStatusBadge(order.status)}</TableCell>
                    <TableCell>
                      {unmappedCount > 0 ? (
                        <div className="flex items-center gap-1 text-yellow-600">
                          <AlertCircle className="h-4 w-4" />
                          <span className="text-sm">{unmappedCount} unmapped</span>
                        </div>
                      ) : (
                        <span className="text-sm text-green-600">All mapped</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link href={`/orders/${order.id}`}>
                        <Button variant="ghost" size="icon">
                          <Eye className="h-4 w-4" />
                          <span className="sr-only">View order</span>
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total}{' '}
            orders
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
    </div>
  )
}
