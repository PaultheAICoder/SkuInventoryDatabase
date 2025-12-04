'use client'

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
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { ForecastStatusBadge } from './ForecastStatusBadge'
import type { ComponentForecastResponse } from '@/types/forecast'

interface ForecastTableProps {
  forecasts: ComponentForecastResponse[]
  total: number
  page: number
  pageSize: number
}

export function ForecastTable({ forecasts, total, page, pageSize }: ForecastTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const totalPages = Math.ceil(total / pageSize)
  const showOnlyAtRisk = searchParams.get('showOnlyAtRisk') === 'true'

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
    router.push(`/forecasts?${newParams.toString()}`)
  }

  const handleSort = (column: string) => {
    const currentSortBy = searchParams.get('sortBy') ?? 'runoutDate'
    const currentSortOrder = searchParams.get('sortOrder') ?? 'asc'

    const newSortOrder =
      currentSortBy === column && currentSortOrder === 'asc' ? 'desc' : 'asc'

    updateFilters({ sortBy: column, sortOrder: newSortOrder })
  }

  const handleAtRiskToggle = (checked: boolean) => {
    updateFilters({ showOnlyAtRisk: checked ? 'true' : '' })
  }

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString()
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="showOnlyAtRisk"
            checked={showOnlyAtRisk}
            onCheckedChange={handleAtRiskToggle}
          />
          <Label htmlFor="showOnlyAtRisk" className="text-sm font-medium cursor-pointer">
            Show only at-risk
          </Label>
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
                  Component Name
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>SKU Code</TableHead>
              <TableHead className="text-right">On-Hand Qty</TableHead>
              <TableHead className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  className="-mr-3"
                  onClick={() => handleSort('consumption')}
                >
                  Daily Consumption
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead className="text-right">Days Until Runout</TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-3"
                  onClick={() => handleSort('runoutDate')}
                >
                  Runout Date
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  className="-mr-3"
                  onClick={() => handleSort('reorderQty')}
                >
                  Reorder Qty
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>Reorder By</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {forecasts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                  No forecasts found.
                </TableCell>
              </TableRow>
            ) : (
              forecasts.map((forecast) => (
                <TableRow key={forecast.componentId}>
                  <TableCell>
                    <Link
                      href={`/components/${forecast.componentId}`}
                      className="font-medium hover:underline"
                    >
                      {forecast.componentName}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{forecast.skuCode}</TableCell>
                  <TableCell className="text-right font-mono" suppressHydrationWarning>
                    {forecast.quantityOnHand.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono" suppressHydrationWarning>
                    {parseFloat(forecast.averageDailyConsumption).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-mono" suppressHydrationWarning>
                    {forecast.daysUntilRunout !== null ? forecast.daysUntilRunout.toLocaleString() : '-'}
                  </TableCell>
                  <TableCell className="font-mono text-sm" suppressHydrationWarning>
                    {formatDate(forecast.runoutDate)}
                  </TableCell>
                  <TableCell className="text-right font-mono" suppressHydrationWarning>
                    {forecast.recommendedReorderQty.toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-sm" suppressHydrationWarning>
                    {formatDate(forecast.recommendedReorderDate)}
                  </TableCell>
                  <TableCell>
                    <ForecastStatusBadge
                      averageDailyConsumption={forecast.averageDailyConsumption}
                      recommendedReorderDate={forecast.recommendedReorderDate}
                    />
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
            forecasts
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
