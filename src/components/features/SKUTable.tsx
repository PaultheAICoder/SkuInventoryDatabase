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
import type { SKUResponse } from '@/types/sku'
import { salesChannels } from '@/types'

interface SKUTableProps {
  skus: SKUResponse[]
  total: number
  page: number
  pageSize: number
}

export function SKUTable({ skus, total, page, pageSize }: SKUTableProps) {
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
    router.push(`/skus?${newParams.toString()}`)
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

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search SKUs..."
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
            value={searchParams.get('salesChannel') || 'all'}
            onValueChange={(value) => updateFilters({ salesChannel: value === 'all' ? '' : value })}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Channels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Channels</SelectItem>
              {salesChannels.map((channel) => (
                <SelectItem key={channel} value={channel}>
                  {channel}
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
                  onClick={() => handleSort('internalCode')}
                >
                  Internal Code
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-3"
                  onClick={() => handleSort('salesChannel')}
                >
                  Channel
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>Active BOM</TableHead>
              <TableHead className="text-right">Unit Cost</TableHead>
              <TableHead className="text-right">Buildable</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {skus.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No SKUs found.
                </TableCell>
              </TableRow>
            ) : (
              skus.map((sku) => (
                <TableRow key={sku.id}>
                  <TableCell>
                    <Link
                      href={`/skus/${sku.id}`}
                      className="font-medium hover:underline"
                    >
                      {sku.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{sku.internalCode}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{sku.salesChannel}</Badge>
                  </TableCell>
                  <TableCell>
                    {sku.activeBom ? (
                      <span className="text-sm">{sku.activeBom.versionName}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">No BOM</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {sku.activeBom
                      ? `$${parseFloat(sku.activeBom.unitCost).toFixed(2)}`
                      : '-'}
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
            SKUs
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
