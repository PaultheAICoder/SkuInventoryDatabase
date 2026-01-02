'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Filter } from 'lucide-react'

const ACTION_OPTIONS = [
  { value: 'all', label: 'All Actions' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'SNOOZED', label: 'Snoozed' },
]

const TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'KEYWORD_GRADUATION', label: 'Keyword Graduation' },
  { value: 'NEGATIVE_KEYWORD', label: 'Negative Keyword' },
  { value: 'DUPLICATE_KEYWORD', label: 'Duplicate Keyword' },
  { value: 'BUDGET_INCREASE', label: 'Budget Increase' },
  { value: 'BID_DECREASE', label: 'Bid Decrease' },
]

export interface ChangeLogFiltersValue {
  action: string
  type: string
  keyword: string
  startDate: string
  endDate: string
}

interface ChangeLogFiltersProps {
  filters: ChangeLogFiltersValue
  onFiltersChange: (filters: ChangeLogFiltersValue) => void
  onApply: () => void
  onClear: () => void
}

export function ChangeLogFilters({
  filters,
  onFiltersChange,
  onApply,
  onClear,
}: ChangeLogFiltersProps) {
  const updateFilter = <K extends keyof ChangeLogFiltersValue>(
    key: K,
    value: ChangeLogFiltersValue[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value })
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters</span>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Action</label>
            <Select
              value={filters.action || 'all'}
              onValueChange={(value) => updateFilter('action', value === 'all' ? '' : value)}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                {ACTION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Type</label>
            <Select
              value={filters.type || 'all'}
              onValueChange={(value) => updateFilter('type', value === 'all' ? '' : value)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Keyword Search</label>
            <Input
              type="text"
              placeholder="Search keywords..."
              className="w-[180px]"
              value={filters.keyword}
              onChange={(e) => updateFilter('keyword', e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Date From</label>
            <Input
              type="date"
              className="w-[150px]"
              value={filters.startDate}
              onChange={(e) => updateFilter('startDate', e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Date To</label>
            <Input
              type="date"
              className="w-[150px]"
              value={filters.endDate}
              onChange={(e) => updateFilter('endDate', e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" onClick={onApply}>
              Apply
            </Button>
            <Button variant="outline" onClick={onClear}>
              Clear
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
