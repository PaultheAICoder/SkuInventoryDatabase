'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { DateRangePreset } from '@/types/amazon-analytics'

interface DateRangeSelectorProps {
  value: DateRangePreset
  customStartDate?: string
  customEndDate?: string
  onChange: (preset: DateRangePreset, startDate?: string, endDate?: string) => void
}

const PRESET_OPTIONS: Array<{ value: DateRangePreset; label: string }> = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'custom', label: 'Custom' },
]

export function DateRangeSelector({
  value,
  customStartDate,
  customEndDate,
  onChange,
}: DateRangeSelectorProps) {
  const [localStartDate, setLocalStartDate] = useState(customStartDate || '')
  const [localEndDate, setLocalEndDate] = useState(customEndDate || '')

  const handlePresetClick = (preset: DateRangePreset) => {
    if (preset === 'custom') {
      // When switching to custom, use local dates if set
      onChange(preset, localStartDate || undefined, localEndDate || undefined)
    } else {
      onChange(preset)
    }
  }

  const handleStartDateChange = (date: string) => {
    setLocalStartDate(date)
    if (value === 'custom') {
      onChange('custom', date || undefined, localEndDate || undefined)
    }
  }

  const handleEndDateChange = (date: string) => {
    setLocalEndDate(date)
    if (value === 'custom') {
      onChange('custom', localStartDate || undefined, date || undefined)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Preset buttons */}
      <div className="flex gap-1">
        {PRESET_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => handlePresetClick(opt.value)}
            className={cn(
              'px-3 py-1.5 text-sm rounded-md transition-colors font-medium',
              value === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Custom date inputs - only show when custom is selected */}
      {value === 'custom' && (
        <div className="flex items-center gap-2 ml-2">
          <label className="sr-only" htmlFor="start-date">
            Start Date
          </label>
          <input
            id="start-date"
            type="date"
            value={localStartDate}
            onChange={(e) => handleStartDateChange(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Start date"
          />
          <span className="text-muted-foreground">to</span>
          <label className="sr-only" htmlFor="end-date">
            End Date
          </label>
          <input
            id="end-date"
            type="date"
            value={localEndDate}
            onChange={(e) => handleEndDateChange(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="End date"
          />
        </div>
      )}
    </div>
  )
}
