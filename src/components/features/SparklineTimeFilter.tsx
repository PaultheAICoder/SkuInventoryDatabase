'use client'

import { cn } from '@/lib/utils'

interface SparklineTimeFilterProps {
  value: number
  onChange: (days: number) => void
}

const OPTIONS = [
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
]

export function SparklineTimeFilter({ value, onChange }: SparklineTimeFilterProps) {
  return (
    <div className="flex gap-1">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'px-2 py-1 text-xs rounded-md transition-colors',
            value === opt.value
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
