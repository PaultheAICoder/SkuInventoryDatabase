'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import type { ComponentResponse } from '@/types/component'
import { parseApiError, type FieldErrors } from '@/lib/api-errors'

interface CategoryOption {
  value: string
  label: string
}

interface ComponentFormProps {
  component?: ComponentResponse
  onSuccess?: () => void
}

const UNITS_OF_MEASURE = [
  { value: 'each', label: 'Each' },
  { value: 'box', label: 'Box' },
  { value: 'pack', label: 'Pack' },
  { value: 'roll', label: 'Roll' },
  { value: 'sheet', label: 'Sheet' },
]

export function ComponentForm({ component, onSuccess }: ComponentFormProps) {
  const router = useRouter()
  const isEditing = !!component

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)

  const [formData, setFormData] = useState({
    name: component?.name ?? '',
    skuCode: component?.skuCode ?? '',
    category: component?.category ?? '',
    unitOfMeasure: component?.unitOfMeasure ?? 'each',
    costPerUnit: component?.costPerUnit ?? '0',
    reorderPoint: component?.reorderPoint?.toString() ?? '0',
    leadTimeDays: component?.leadTimeDays?.toString() ?? '0',
    notes: component?.notes ?? '',
  })

  // Fetch categories on mount
  useEffect(() => {
    async function fetchCategories() {
      try {
        const res = await fetch('/api/categories?isActive=true&pageSize=100')
        if (res.ok) {
          const data = await res.json()
          const categoryOptions = (data?.data || []).map((cat: { name: string }) => ({
            value: cat.name,
            label: cat.name,
          }))
          setCategories(categoryOptions)
        }
      } catch (err) {
        console.error('Failed to fetch categories:', err)
      } finally {
        setCategoriesLoading(false)
      }
    }

    fetchCategories()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const url = isEditing ? `/api/components/${component.id}` : '/api/components'
      const method = isEditing ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          costPerUnit: parseFloat(formData.costPerUnit),
          reorderPoint: parseInt(formData.reorderPoint, 10),
          leadTimeDays: parseInt(formData.leadTimeDays, 10),
          category: formData.category || null,
          notes: formData.notes || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const parsed = parseApiError(data)

        setFieldErrors(parsed.fieldErrors)
        setError(parsed.message)

        toast.error('Failed to save component', {
          description: parsed.message,
        })
        return
      }

      // Clear field errors on success
      setFieldErrors({})

      if (onSuccess) {
        onSuccess()
      } else {
        router.push('/components')
        router.refresh()
      }
    } catch (err) {
      // Handle network errors or unexpected failures
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
      toast.error('Failed to save component', {
        description: message,
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? 'Edit Component' : 'New Component'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Medium Tool"
                required
              />
              {fieldErrors.name && (
                <p className="text-sm text-destructive">{fieldErrors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="skuCode">SKU Code *</Label>
              <Input
                id="skuCode"
                value={formData.skuCode}
                onChange={(e) => setFormData((prev) => ({ ...prev, skuCode: e.target.value }))}
                placeholder="e.g., TT-MED-TOOL"
                required
                disabled={isEditing}
              />
              {fieldErrors.skuCode && (
                <p className="text-sm text-destructive">{fieldErrors.skuCode}</p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, category: value }))}
                disabled={categoriesLoading}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder={categoriesLoading ? 'Loading...' : 'Select a category'} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="unitOfMeasure">Unit of Measure</Label>
              <Select
                value={formData.unitOfMeasure}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, unitOfMeasure: value }))
                }
              >
                <SelectTrigger id="unitOfMeasure">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS_OF_MEASURE.map((unit) => (
                    <SelectItem key={unit.value} value={unit.value}>
                      {unit.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="costPerUnit">Cost per Unit ($)</Label>
              <Input
                id="costPerUnit"
                type="number"
                step="0.0001"
                min="0"
                value={formData.costPerUnit}
                onChange={(e) => setFormData((prev) => ({ ...prev, costPerUnit: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reorderPoint">Reorder Point</Label>
              <Input
                id="reorderPoint"
                type="number"
                min="0"
                value={formData.reorderPoint}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, reorderPoint: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="leadTimeDays">Lead Time (days)</Label>
              <Input
                id="leadTimeDays"
                type="number"
                min="0"
                value={formData.leadTimeDays}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, leadTimeDays: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={formData.notes}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Additional notes about this component..."
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Component'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
