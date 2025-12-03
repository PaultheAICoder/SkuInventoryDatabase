'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LOCATION_TYPES, LOCATION_TYPE_DISPLAY_NAMES } from '@/types/location'
import type { LocationResponse, LocationType } from '@/types/location'

interface LocationFormProps {
  location?: LocationResponse
  onSuccess?: () => void
}

export function LocationForm({ location, onSuccess }: LocationFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: location?.name ?? '',
    type: location?.type ?? 'warehouse',
    isDefault: location?.isDefault ?? false,
    notes: location?.notes ?? '',
    isActive: location?.isActive ?? true,
  })

  const isEditing = !!location

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const url = isEditing ? `/api/locations/${location.id}` : '/api/locations'
      const method = isEditing ? 'PATCH' : 'POST'

      // Build request body
      const body: Record<string, unknown> = {
        name: formData.name,
        type: formData.type,
        notes: formData.notes || null,
      }

      if (!isEditing) {
        body.isDefault = formData.isDefault
      } else {
        if (formData.isDefault && !location.isDefault) {
          body.isDefault = true
        }
        body.isActive = formData.isActive
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to save location')
      }

      if (onSuccess) {
        onSuccess()
      } else {
        router.push('/settings/locations')
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? 'Edit Location' : 'Create Location'}</CardTitle>
          <CardDescription>
            {isEditing
              ? 'Update location information'
              : 'Add a new inventory location'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="Main Warehouse"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Type *</Label>
              <Select
                value={formData.type}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, type: value as LocationType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCATION_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {LOCATION_TYPE_DISPLAY_NAMES[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Optional notes about this location..."
              value={formData.notes}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              rows={3}
            />
          </div>

          {!isEditing && (
            <div className="flex items-center space-x-2">
              <input
                id="isDefault"
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={formData.isDefault}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, isDefault: e.target.checked }))
                }
              />
              <Label htmlFor="isDefault" className="font-normal">
                Set as default location
              </Label>
            </div>
          )}

          {isEditing && !location.isDefault && (
            <div className="flex items-center space-x-2">
              <input
                id="isDefault"
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={formData.isDefault}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, isDefault: e.target.checked }))
                }
              />
              <Label htmlFor="isDefault" className="font-normal">
                Set as default location
              </Label>
            </div>
          )}

          {isEditing && (
            <div className="flex items-center space-x-2">
              <input
                id="isActive"
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={formData.isActive}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, isActive: e.target.checked }))
                }
                disabled={location.isDefault}
              />
              <Label htmlFor="isActive" className="font-normal">
                Active (inactive locations cannot be used for inventory)
                {location.isDefault && (
                  <span className="text-muted-foreground ml-2">(default location cannot be deactivated)</span>
                )}
              </Label>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Location'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
