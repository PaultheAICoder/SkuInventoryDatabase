'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { RequiredThresholds } from '@/lib/recommendation-utils'

interface ThresholdSettingsFormProps {
  brandName: string
  thresholds: RequiredThresholds
  defaults: RequiredThresholds
  onSave: (thresholds: Partial<RequiredThresholds>) => Promise<void>
}

export function ThresholdSettingsForm({
  brandName,
  thresholds,
  defaults,
  onSave,
}: ThresholdSettingsFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [formData, setFormData] = useState({
    graduation: { ...thresholds.graduation },
    negative: { ...thresholds.negative },
    budget: { ...thresholds.budget },
  })

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
      setError(err instanceof Error ? err.message : 'Failed to save thresholds')
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    setFormData({
      graduation: { ...defaults.graduation },
      negative: { ...defaults.negative },
      budget: { ...defaults.budget },
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      {success && (
        <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800">
          Thresholds saved successfully
        </div>
      )}

      {/* Brand Info */}
      <Card>
        <CardHeader>
          <CardTitle>Threshold Configuration</CardTitle>
          <CardDescription>
            Configure recommendation thresholds for {brandName}. Leave blank to use defaults.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Keyword Graduation Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle>Keyword Graduation</CardTitle>
          <CardDescription>
            Thresholds for graduating keywords from Discovery to Accelerate campaigns
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="graduation.maxAcos">Max ACOS (%)</Label>
              <Input
                id="graduation.maxAcos"
                type="number"
                min="0"
                max="100"
                step="1"
                value={(formData.graduation.maxAcos * 100).toFixed(0)}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    graduation: {
                      ...prev.graduation,
                      maxAcos: (parseFloat(e.target.value) || 25) / 100,
                    },
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Default: {(defaults.graduation.maxAcos * 100).toFixed(0)}%
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="graduation.minConversions">Min Conversions</Label>
              <Input
                id="graduation.minConversions"
                type="number"
                min="0"
                value={formData.graduation.minConversions}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    graduation: {
                      ...prev.graduation,
                      minConversions: parseInt(e.target.value) || 5,
                    },
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Default: {defaults.graduation.minConversions}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="graduation.minSpend">Min Spend ($)</Label>
              <Input
                id="graduation.minSpend"
                type="number"
                min="0"
                step="1"
                value={formData.graduation.minSpend}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    graduation: {
                      ...prev.graduation,
                      minSpend: parseFloat(e.target.value) || 50,
                    },
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Default: ${defaults.graduation.minSpend}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Negative Keyword Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle>Negative Keywords</CardTitle>
          <CardDescription>
            Thresholds for suggesting keywords to add as negatives
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="negative.minSpend">Min Spend ($)</Label>
              <Input
                id="negative.minSpend"
                type="number"
                min="0"
                step="1"
                value={formData.negative.minSpend}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    negative: {
                      ...prev.negative,
                      minSpend: parseFloat(e.target.value) || 25,
                    },
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Default: ${defaults.negative.minSpend}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="negative.maxOrders">Max Orders</Label>
              <Input
                id="negative.maxOrders"
                type="number"
                min="0"
                value={formData.negative.maxOrders}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    negative: {
                      ...prev.negative,
                      maxOrders: parseInt(e.target.value) || 0,
                    },
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Default: {defaults.negative.maxOrders}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="negative.minClicks">Min Clicks</Label>
              <Input
                id="negative.minClicks"
                type="number"
                min="0"
                value={formData.negative.minClicks}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    negative: {
                      ...prev.negative,
                      minClicks: parseInt(e.target.value) || 50,
                    },
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Default: {defaults.negative.minClicks}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Budget Strategy Thresholds */}
      <Card>
        <CardHeader>
          <CardTitle>Budget & Bid Strategy</CardTitle>
          <CardDescription>
            Thresholds for budget increase and bid decrease recommendations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="budget.minRoas">Min ROAS for Budget Increase</Label>
              <Input
                id="budget.minRoas"
                type="number"
                min="0"
                step="0.1"
                value={formData.budget.minRoas}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    budget: {
                      ...prev.budget,
                      minRoas: parseFloat(e.target.value) || 1.5,
                    },
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Default: {defaults.budget.minRoas}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="budget.budgetUtilization">Budget Utilization (%)</Label>
              <Input
                id="budget.budgetUtilization"
                type="number"
                min="0"
                max="100"
                step="1"
                value={(formData.budget.budgetUtilization * 100).toFixed(0)}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    budget: {
                      ...prev.budget,
                      budgetUtilization: (parseFloat(e.target.value) || 95) / 100,
                    },
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Default: {(defaults.budget.budgetUtilization * 100).toFixed(0)}%
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="budget.maxAcosForIncrease">Max ACOS for Budget Increase (%)</Label>
              <Input
                id="budget.maxAcosForIncrease"
                type="number"
                min="0"
                max="100"
                step="1"
                value={(formData.budget.maxAcosForIncrease * 100).toFixed(0)}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    budget: {
                      ...prev.budget,
                      maxAcosForIncrease: (parseFloat(e.target.value) || 25) / 100,
                    },
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Default: {(defaults.budget.maxAcosForIncrease * 100).toFixed(0)}%
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="budget.minAcosForDecrease">Min ACOS for Bid Decrease (%)</Label>
              <Input
                id="budget.minAcosForDecrease"
                type="number"
                min="0"
                max="100"
                step="1"
                value={(formData.budget.minAcosForDecrease * 100).toFixed(0)}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    budget: {
                      ...prev.budget,
                      minAcosForDecrease: (parseFloat(e.target.value) || 35) / 100,
                    },
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Default: {(defaults.budget.minAcosForDecrease * 100).toFixed(0)}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={handleReset}>
          Reset to Defaults
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving...' : 'Save Thresholds'}
        </Button>
      </div>
    </form>
  )
}
