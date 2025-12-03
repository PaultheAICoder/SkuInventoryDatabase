'use client'

import { useState } from 'react'
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { CompanySettings } from '@/types/settings'

interface SettingsFormProps {
  settings: CompanySettings
  companyName: string
  onSave: (settings: Partial<CompanySettings>) => Promise<void>
}

export function SettingsForm({ settings, companyName, onSave }: SettingsFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [formData, setFormData] = useState<CompanySettings>(settings)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setSuccess(false)

    try {
      await onSave(formData)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      {success && (
        <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800">
          Settings saved successfully
        </div>
      )}

      {/* Company Info */}
      <Card>
        <CardHeader>
          <CardTitle>Company Information</CardTitle>
          <CardDescription>Basic information about your organization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Company Name</Label>
            <Input value={companyName} disabled />
            <p className="text-xs text-muted-foreground">
              Contact support to change your company name
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Inventory Settings</CardTitle>
          <CardDescription>Configure how inventory is managed</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <input
              id="allowNegativeInventory"
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300"
              checked={formData.allowNegativeInventory}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, allowNegativeInventory: e.target.checked }))
              }
            />
            <div>
              <Label htmlFor="allowNegativeInventory" className="font-normal">
                Allow Negative Inventory
              </Label>
              <p className="text-xs text-muted-foreground">
                Allow build transactions even when component inventory is insufficient
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="defaultLeadTimeDays">Default Lead Time (days)</Label>
              <Input
                id="defaultLeadTimeDays"
                type="number"
                min="0"
                value={formData.defaultLeadTimeDays}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    defaultLeadTimeDays: parseInt(e.target.value) || 0,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Default lead time for new components
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reorderWarningMultiplier">Reorder Warning Multiplier</Label>
              <Input
                id="reorderWarningMultiplier"
                type="number"
                min="1"
                step="0.1"
                value={formData.reorderWarningMultiplier}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    reorderWarningMultiplier: parseFloat(e.target.value) || 1.5,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Warning threshold = Reorder Point × Multiplier
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Display Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Display Settings</CardTitle>
          <CardDescription>Customize how data is displayed</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="dateFormat">Date Format</Label>
              <Select
                value={formData.dateFormat}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    dateFormat: value as CompanySettings['dateFormat'],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MM/DD/YYYY">MM/DD/YYYY (US)</SelectItem>
                  <SelectItem value="DD/MM/YYYY">DD/MM/YYYY (EU)</SelectItem>
                  <SelectItem value="YYYY-MM-DD">YYYY-MM-DD (ISO)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="currencySymbol">Currency Symbol</Label>
              <Input
                id="currencySymbol"
                maxLength={5}
                value={formData.currencySymbol}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, currencySymbol: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="decimalPlaces">Decimal Places</Label>
              <Select
                value={formData.decimalPlaces.toString()}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, decimalPlaces: parseInt(value) }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0 (1234)</SelectItem>
                  <SelectItem value="2">2 (1234.56)</SelectItem>
                  <SelectItem value="4">4 (1234.5678)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quality Alert Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Quality Alerts</CardTitle>
          <CardDescription>Configure defect rate monitoring and alert thresholds</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <input
              id="enableDefectAlerts"
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300"
              checked={formData.enableDefectAlerts}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, enableDefectAlerts: e.target.checked }))
              }
            />
            <div>
              <Label htmlFor="enableDefectAlerts" className="font-normal">
                Enable Defect Alerts
              </Label>
              <p className="text-xs text-muted-foreground">
                Generate alerts when defect rates exceed configured thresholds
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="defectRateWarningThreshold">Warning Threshold (%)</Label>
              <Input
                id="defectRateWarningThreshold"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={formData.defectRateWarningThreshold}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    defectRateWarningThreshold: parseFloat(e.target.value) || 5,
                  }))
                }
                disabled={!formData.enableDefectAlerts}
              />
              <p className="text-xs text-muted-foreground">
                Defect rates above this will trigger warning alerts
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="defectRateCriticalThreshold">Critical Threshold (%)</Label>
              <Input
                id="defectRateCriticalThreshold"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={formData.defectRateCriticalThreshold}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    defectRateCriticalThreshold: parseFloat(e.target.value) || 10,
                  }))
                }
                disabled={!formData.enableDefectAlerts}
              />
              <p className="text-xs text-muted-foreground">
                Defect rates above this will trigger critical alerts
              </p>
            </div>
          </div>

          {formData.defectRateWarningThreshold >= formData.defectRateCriticalThreshold && (
            <p className="text-sm text-yellow-600">
              Warning: Warning threshold should be lower than critical threshold
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </form>
  )
}
