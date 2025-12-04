'use client'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Settings2, Download } from 'lucide-react'
import type { ForecastConfigResponse } from '@/types/forecast'

interface ForecastQuickSettingsProps {
  config: ForecastConfigResponse | null
  onLookbackChange: (days: number) => void
  onOpenSettings: () => void
  onExport: () => void
  disabled?: boolean
  canEdit?: boolean
}

const LOOKBACK_OPTIONS = [7, 14, 30, 60, 90, 180, 365]

export function ForecastQuickSettings({
  config,
  onLookbackChange,
  onOpenSettings,
  onExport,
  disabled = false,
  canEdit = false,
}: ForecastQuickSettingsProps) {
  // Format excluded types for display
  const excludedSummary =
    config?.excludedTransactionTypes && config.excludedTransactionTypes.length > 0
      ? config.excludedTransactionTypes.join(', ')
      : 'none'

  return (
    <div className="flex flex-wrap items-center gap-4 text-sm">
      {/* Quick Lookback Selector */}
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Lookback:</span>
        <Select
          value={String(config?.lookbackDays ?? 30)}
          onValueChange={(value) => onLookbackChange(parseInt(value, 10))}
          disabled={disabled || !canEdit}
        >
          <SelectTrigger className="w-[100px] h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOOKBACK_OPTIONS.map((days) => (
              <SelectItem key={days} value={String(days)}>
                {days} days
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Config Summary */}
      <div className="flex items-center gap-2 text-muted-foreground">
        <span>Safety: {config?.safetyDays ?? 7} days</span>
        <span className="text-muted-foreground/50">|</span>
        <span>Excludes: {excludedSummary}</span>
      </div>

      {/* Export Button - always visible */}
      <Button
        variant="outline"
        size="sm"
        onClick={onExport}
        disabled={disabled}
        className={canEdit ? '' : 'ml-auto'}
      >
        <Download className="mr-2 h-4 w-4" />
        Export
      </Button>

      {/* Settings Button (Admin only) */}
      {canEdit && (
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenSettings}
          disabled={disabled}
        >
          <Settings2 className="mr-2 h-4 w-4" />
          Settings
        </Button>
      )}
    </div>
  )
}
