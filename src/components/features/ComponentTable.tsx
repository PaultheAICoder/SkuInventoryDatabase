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
import { ArrowUpDown, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { LocationFilter } from './LocationFilter'
import type { ComponentResponse } from '@/types/component'

interface ComponentTableProps {
  components: ComponentResponse[]
  total: number
  page: number
  pageSize: number
  locationId?: string
}

const CATEGORIES = [
  { value: 'all', label: 'All Categories' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'tool', label: 'Tool' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'accessory', label: 'Accessory' },
  { value: 'other', label: 'Other' },
]

const REORDER_STATUSES = [
  { value: 'all', label: 'All Status' },
  { value: 'critical', label: 'Critical' },
  { value: 'warning', label: 'Warning' },
  { value: 'ok', label: 'OK' },
]

export function ComponentTable({ components, total, page, pageSize, locationId }: ComponentTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('search') ?? '')

  const totalPages = Math.ceil(total / pageSize)

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
    router.push(`/components?${newParams.toString()}`)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    updateFilters({ search })
  }

  const handleSort = (column: string) => {
    const currentSortBy = searchParams.get('sortBy') ?? 'name'
    const currentSortOrder = searchParams.get('sortOrder') ?? 'asc'

    const newSortOrder =
      currentSortBy === column && currentSortOrder === 'asc' ? 'desc' : 'asc'

    updateFilters({ sortBy: column, sortOrder: newSortOrder })
  }

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

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search components..."
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
            value={searchParams.get('category') || 'all'}
            onValueChange={(value) => updateFilters({ category: value === 'all' ? '' : value })}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={searchParams.get('reorderStatus') || 'all'}
            onValueChange={(value) => updateFilters({ reorderStatus: value === 'all' ? '' : value })}
          >
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {REORDER_STATUSES.map((status) => (
                <SelectItem key={status.value} value={status.value}>
                  {status.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <LocationFilter
            value={locationId}
            onValueChange={(value) => updateFilters({ locationId: value || '' })}
          />
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
                  onClick={() => handleSort('name')}
                >
                  Name
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-3"
                  onClick={() => handleSort('skuCode')}
                >
                  SKU Code
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Qty on Hand</TableHead>
              <TableHead className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  className="-mr-3"
                  onClick={() => handleSort('costPerUnit')}
                >
                  Cost/Unit
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {components.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No components found.
                </TableCell>
              </TableRow>
            ) : (
              components.map((component) => (
                <TableRow key={component.id}>
                  <TableCell>
                    <Link
                      href={`/components/${component.id}`}
                      className="font-medium hover:underline"
                    >
                      {component.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{component.skuCode}</TableCell>
                  <TableCell className="capitalize">{component.category ?? '-'}</TableCell>
                  <TableCell className="text-right font-mono" suppressHydrationWarning>
                    {component.quantityOnHand.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    ${parseFloat(component.costPerUnit).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getReorderBadgeVariant(component.reorderStatus)}>
                      {component.reorderStatus.toUpperCase()}
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
            components
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
