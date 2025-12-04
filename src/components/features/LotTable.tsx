'use client'

import { useState, useEffect } from 'react'
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
import { ArrowUpDown, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import type { LotResponse } from '@/types/lot'

interface LotTableProps {
  lots: LotResponse[]
  total: number
  page: number
  pageSize: number
}

const EXPIRY_STATUSES = [
  { value: 'all', label: 'All Status' },
  { value: 'expired', label: 'Expired' },
  { value: 'expiring_soon', label: 'Expiring Soon' },
  { value: 'ok', label: 'OK' },
]

interface ComponentOption {
  id: string
  name: string
  skuCode: string
}

export function LotTable({ lots, total, page, pageSize }: LotTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('search') ?? '')
  const [components, setComponents] = useState<ComponentOption[]>([])

  const totalPages = Math.ceil(total / pageSize)

  // Fetch components for filter dropdown
  useEffect(() => {
    async function fetchComponents() {
      try {
        const res = await fetch('/api/components?pageSize=100')
        if (res.ok) {
          const { data } = await res.json()
          setComponents(data.map((c: ComponentOption) => ({ id: c.id, name: c.name, skuCode: c.skuCode })))
        }
      } catch {
        // Silently fail - filter will just be empty
      }
    }
    fetchComponents()
  }, [])

  const updateFilters = (params: Record<string, string>) => {
    const newParams = new URLSearchParams(searchParams.toString())
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        newParams.set(key, value)
      } else {
        newParams.delete(key)
      }
    })
    // Reset to page 1 when filters change (except for page changes)
    if (!params.page) {
      newParams.set('page', '1')
    }
    router.push(`/lots?${newParams.toString()}`)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    updateFilters({ search })
  }

  const handleSort = (column: string) => {
    const currentSortBy = searchParams.get('sortBy') ?? 'createdAt'
    const currentSortOrder = searchParams.get('sortOrder') ?? 'desc'

    const newSortOrder =
      currentSortBy === column && currentSortOrder === 'asc' ? 'desc' : 'asc'

    updateFilters({ sortBy: column, sortOrder: newSortOrder })
  }

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

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by lot number..."
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
            value={searchParams.get('componentId') || 'all'}
            onValueChange={(value) => updateFilters({ componentId: value === 'all' ? '' : value })}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Component" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Components</SelectItem>
              {components.map((comp) => (
                <SelectItem key={comp.id} value={comp.id}>
                  {comp.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={searchParams.get('status') || 'all'}
            onValueChange={(value) => updateFilters({ status: value === 'all' ? '' : value })}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {EXPIRY_STATUSES.map((status) => (
                <SelectItem key={status.value} value={status.value}>
                  {status.label}
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
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-3"
                  onClick={() => handleSort('lotNumber')}
                >
                  Lot Number
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>Component</TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-3"
                  onClick={() => handleSort('expiryDate')}
                >
                  Expiry Date
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  className="-mr-3"
                  onClick={() => handleSort('balance')}
                >
                  Balance
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lots.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No lots found.
                </TableCell>
              </TableRow>
            ) : (
              lots.map((lot) => (
                <TableRow key={lot.id}>
                  <TableCell>
                    <Link
                      href={`/lots/${lot.id}`}
                      className="font-medium hover:underline"
                    >
                      {lot.lotNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div>
                      <Link
                        href={`/components/${lot.componentId}`}
                        className="hover:underline"
                      >
                        {lot.componentName}
                      </Link>
                      <div className="text-xs text-muted-foreground font-mono">
                        {lot.componentSkuCode}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell suppressHydrationWarning>
                    {lot.expiryDate ? new Date(lot.expiryDate).toLocaleDateString() : '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono" suppressHydrationWarning>
                    {parseFloat(lot.balance).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(lot.status)}>
                      {formatStatusLabel(lot.status)}
                    </Badge>
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
            lots
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
