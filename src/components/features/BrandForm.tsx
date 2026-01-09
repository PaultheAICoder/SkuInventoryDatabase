'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { BrandResponse } from '@/types/brand'

interface BrandFormProps {
  brand?: BrandResponse
  onSuccess?: () => void
}

export function BrandForm({ brand, onSuccess }: BrandFormProps) {
  const router = useRouter()
  const { update: updateSession } = useSession()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([])
  const [isLoadingLocations, setIsLoadingLocations] = useState(false)

  const [formData, setFormData] = useState({
    name: brand?.name ?? '',
    isActive: brand?.isActive ?? true,
    defaultLocationId: brand?.defaultLocationId ?? '',
  })

  useEffect(() => {
    fetchLocations()
  }, [])

  const fetchLocations = async () => {
    setIsLoadingLocations(true)
    try {
      const res = await fetch('/api/locations?isActive=true&pageSize=50')
      if (res.ok) {
        const data = await res.json()
        setLocations(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch locations:', err)
    } finally {
      setIsLoadingLocations(false)
    }
  }

  const isEditing = !!brand

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const url = isEditing ? `/api/brands/${brand.id}` : '/api/brands'
      const method = isEditing ? 'PATCH' : 'POST'

      // Build request body
      const body: Record<string, unknown> = {
        name: formData.name,
        defaultLocationId: formData.defaultLocationId || null,
      }

      if (isEditing) {
        body.isActive = formData.isActive
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to save brand')
      }

      // Refresh session after creating a new brand (so it appears in dropdown immediately)
      if (!isEditing) {
        try {
          const refreshRes = await fetch('/api/session/refresh', { method: 'POST' })
          if (refreshRes.ok) {
            const refreshData = await refreshRes.json()
            await updateSession({
              companies: refreshData.data.companies,
              companiesWithBrands: refreshData.data.companiesWithBrands,
            })
          }
        } catch (refreshError) {
          console.warn('Failed to refresh session:', refreshError)
        }
      }

      if (onSuccess) {
        onSuccess()
      } else {
        router.push('/settings/brands')
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
          <CardTitle>{isEditing ? 'Edit Brand' : 'Create Brand'}</CardTitle>
          <CardDescription>
            {isEditing
              ? 'Update brand information'
              : 'Add a new brand for your products'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              placeholder="Brand Name"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              required
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="defaultLocation">Default Location</Label>
            <Select
              value={formData.defaultLocationId}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, defaultLocationId: value === 'none' ? '' : value }))}
              disabled={isLoadingLocations}
            >
              <SelectTrigger>
                <SelectValue placeholder={isLoadingLocations ? 'Loading...' : 'No default location'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No default location</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              This location will be pre-selected when creating transactions for this brand.
            </p>
          </div>

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
              />
              <Label htmlFor="isActive" className="font-normal">
                Active (inactive brands cannot be used for new items)
              </Label>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Brand'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
