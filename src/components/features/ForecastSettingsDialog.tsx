'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import type { ForecastConfigResponse } from '@/types/forecast'
import {
  excludableTransactionTypes,
  DEFAULT_FORECAST_CONFIG,
  type ExcludableTransactionType,
} from '@/types/forecast'

interface ForecastSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: ForecastConfigResponse | null
  onSaved: () => void
}

const LOOKBACK_OPTIONS = [7, 14, 30, 60, 90, 180, 365]

// Human-readable labels for transaction types
const TRANSACTION_TYPE_LABELS: Record<ExcludableTransactionType, string> = {
  initial: 'Initial (starting inventory)',
  adjustment: 'Adjustment (manual corrections)',
  receipt: 'Receipt (incoming stock)',
  transfer: 'Transfer (location moves)',
}

export function ForecastSettingsDialog({
  open,
  onOpenChange,
  config,
  onSaved,
}: ForecastSettingsDialogProps) {
  const [lookbackDays, setLookbackDays] = useState<number>(
    config?.lookbackDays ?? DEFAULT_FORECAST_CONFIG.lookbackDays
  )
  const [safetyDays, setSafetyDays] = useState<string>(
    String(config?.safetyDays ?? DEFAULT_FORECAST_CONFIG.safetyDays)
  )
  const [excludedTypes, setExcludedTypes] = useState<string[]>(
    config?.excludedTransactionTypes ?? DEFAULT_FORECAST_CONFIG.excludedTransactionTypes
  )
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form values when dialog opens or config changes
  useEffect(() => {
    if (open && config) {
      setLookbackDays(config.lookbackDays)
      setSafetyDays(String(config.safetyDays))
      setExcludedTypes(config.excludedTransactionTypes)
      setError(null)
    }
  }, [open, config])

  const handleResetToDefaults = () => {
    setLookbackDays(DEFAULT_FORECAST_CONFIG.lookbackDays)
    setSafetyDays(String(DEFAULT_FORECAST_CONFIG.safetyDays))
    setExcludedTypes([...DEFAULT_FORECAST_CONFIG.excludedTransactionTypes])
    setError(null)
  }

  const validateInputs = (): boolean => {
    const safetyNum = parseInt(safetyDays, 10)

    if (isNaN(safetyNum) || safetyNum < 0 || safetyNum > 90) {
      setError('Safety buffer must be between 0 and 90 days')
      return false
    }

    if (!LOOKBACK_OPTIONS.includes(lookbackDays)) {
      setError('Please select a valid lookback window')
      return false
    }

    setError(null)
    return true
  }

  const handleSave = async () => {
    if (!validateInputs()) return

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/forecasts/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lookbackDays,
          safetyDays: parseInt(safetyDays, 10),
          excludedTransactionTypes: excludedTypes,
        }),
      })

      if (res.status === 403) {
        toast.error('You do not have permission to update settings')
        return
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || 'Failed to save settings')
      }

      toast.success('Forecast settings saved')
      onSaved()
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save settings'
      setError(message)
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleExcludedTypeToggle = (type: string, checked: boolean) => {
    if (checked) {
      setExcludedTypes([...excludedTypes, type])
    } else {
      setExcludedTypes(excludedTypes.filter((t) => t !== type))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Forecast Settings</DialogTitle>
          <DialogDescription>
            Configure how forecasts are calculated for this company. Changes will apply to all
            future forecast calculations.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Lookback Window */}
          <div className="space-y-2">
            <Label htmlFor="lookbackDays">Lookback Window</Label>
            <Select
              value={String(lookbackDays)}
              onValueChange={(value) => setLookbackDays(parseInt(value, 10))}
              disabled={isLoading}
            >
              <SelectTrigger id="lookbackDays">
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
            <p className="text-xs text-muted-foreground">
              Number of days of transaction history to analyze for consumption rate
            </p>
          </div>

          {/* Safety Buffer */}
          <div className="space-y-2">
            <Label htmlFor="safetyDays">Safety Buffer (days)</Label>
            <Input
              id="safetyDays"
              type="number"
              min={0}
              max={90}
              value={safetyDays}
              onChange={(e) => setSafetyDays(e.target.value)}
              disabled={isLoading}
              placeholder="0-90"
            />
            <p className="text-xs text-muted-foreground">
              Extra days of buffer added to reorder recommendations beyond lead time (0-90)
            </p>
          </div>

          {/* Excluded Transaction Types */}
          <div className="space-y-3">
            <Label>Excluded Transaction Types</Label>
            <div className="space-y-2">
              {excludableTransactionTypes.map((type) => (
                <div key={type} className="flex items-center space-x-2">
                  <Checkbox
                    id={`exclude-${type}`}
                    checked={excludedTypes.includes(type)}
                    onCheckedChange={(checked) =>
                      handleExcludedTypeToggle(type, checked === true)
                    }
                    disabled={isLoading}
                  />
                  <Label
                    htmlFor={`exclude-${type}`}
                    className="font-normal text-sm cursor-pointer"
                  >
                    {TRANSACTION_TYPE_LABELS[type]}
                  </Label>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Transaction types to exclude from consumption calculations
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={handleResetToDefaults}
            disabled={isLoading}
            className="sm:mr-auto"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset to Defaults
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Settings'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
