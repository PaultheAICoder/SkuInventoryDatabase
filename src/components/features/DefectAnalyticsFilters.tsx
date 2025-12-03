'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { X } from 'lucide-react'

interface FilterOptions {
  skus: Array<{ id: string; name: string; internalCode: string }>
  bomVersions: Array<{ id: string; versionName: string; skuName: string }>
  salesChannels: string[]
}

interface FilterValues {
  dateFrom: string
  dateTo: string
  skuId: string
  bomVersionId: string
  salesChannel: string
  groupBy: 'day' | 'week' | 'month'
}

interface DefectAnalyticsFiltersProps {
  filters: FilterValues
  options: FilterOptions
  onFilterChange: (key: keyof FilterValues, value: string) => void
  onApply: () => void
  onClear: () => void
  isLoading?: boolean
}

export function DefectAnalyticsFilters({
  filters,
  options,
  onFilterChange,
  onApply,
  onClear,
  isLoading,
}: DefectAnalyticsFiltersProps) {
  const hasActiveFilters =
    filters.dateFrom ||
    filters.dateTo ||
    filters.skuId ||
    filters.bomVersionId ||
    filters.salesChannel

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Date From */}
          <div className="space-y-2">
            <Label htmlFor="dateFrom">From Date</Label>
            <Input
              id="dateFrom"
              type="date"
              value={filters.dateFrom}
              onChange={(e) => onFilterChange('dateFrom', e.target.value)}
            />
          </div>

          {/* Date To */}
          <div className="space-y-2">
            <Label htmlFor="dateTo">To Date</Label>
            <Input
              id="dateTo"
              type="date"
              value={filters.dateTo}
              onChange={(e) => onFilterChange('dateTo', e.target.value)}
            />
          </div>

          {/* SKU Filter */}
          <div className="space-y-2">
            <Label htmlFor="skuId">SKU</Label>
            <Select
              value={filters.skuId || 'all'}
              onValueChange={(value) => onFilterChange('skuId', value === 'all' ? '' : value)}
            >
              <SelectTrigger id="skuId">
                <SelectValue placeholder="All SKUs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All SKUs</SelectItem>
                {options.skus.map((sku) => (
                  <SelectItem key={sku.id} value={sku.id}>
                    {sku.name} ({sku.internalCode})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* BOM Version Filter */}
          <div className="space-y-2">
            <Label htmlFor="bomVersionId">BOM Version</Label>
            <Select
              value={filters.bomVersionId || 'all'}
              onValueChange={(value) => onFilterChange('bomVersionId', value === 'all' ? '' : value)}
            >
              <SelectTrigger id="bomVersionId">
                <SelectValue placeholder="All Versions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Versions</SelectItem>
                {options.bomVersions.map((bom) => (
                  <SelectItem key={bom.id} value={bom.id}>
                    {bom.skuName} - {bom.versionName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sales Channel Filter */}
          <div className="space-y-2">
            <Label htmlFor="salesChannel">Sales Channel</Label>
            <Select
              value={filters.salesChannel || 'all'}
              onValueChange={(value) =>
                onFilterChange('salesChannel', value === 'all' ? '' : value)
              }
            >
              <SelectTrigger id="salesChannel">
                <SelectValue placeholder="All Channels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                {options.salesChannels.map((channel) => (
                  <SelectItem key={channel} value={channel}>
                    {channel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Group By */}
          <div className="space-y-2">
            <Label htmlFor="groupBy">Group By</Label>
            <Select
              value={filters.groupBy}
              onValueChange={(value) =>
                onFilterChange('groupBy', value as 'day' | 'week' | 'month')
              }
            >
              <SelectTrigger id="groupBy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Day</SelectItem>
                <SelectItem value="week">Week</SelectItem>
                <SelectItem value="month">Month</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Action Buttons */}
          <div className="flex items-end gap-2 md:col-span-2 lg:col-span-2">
            <Button onClick={onApply} disabled={isLoading} className="flex-1">
              {isLoading ? 'Loading...' : 'Apply Filters'}
            </Button>
            {hasActiveFilters && (
              <Button variant="outline" onClick={onClear} disabled={isLoading}>
                <X className="mr-2 h-4 w-4" />
                Clear
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
