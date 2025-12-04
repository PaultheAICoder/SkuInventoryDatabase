'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface DashboardTimeFilterProps {
  value: number | null
  onChange: (days: number | null) => void
}

const TIME_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
]

export function DashboardTimeFilter({ value, onChange }: DashboardTimeFilterProps) {
  const handleValueChange = (newValue: string) => {
    if (newValue === 'all') {
      onChange(null)
    } else {
      onChange(parseInt(newValue, 10))
    }
  }

  const currentValue = value === null ? 'all' : value.toString()

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground whitespace-nowrap">Time Range:</span>
      <Select value={currentValue} onValueChange={handleValueChange}>
        <SelectTrigger className="w-full sm:w-[160px]" data-testid="time-filter-trigger">
          <SelectValue placeholder="Select time range" />
        </SelectTrigger>
        <SelectContent>
          {TIME_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
