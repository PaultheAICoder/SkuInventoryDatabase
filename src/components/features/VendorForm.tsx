'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { VendorResponse } from '@/types/vendor'

interface VendorFormProps {
  vendor?: VendorResponse
  onSuccess?: () => void
}

export function VendorForm({ vendor, onSuccess }: VendorFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: vendor?.name ?? '',
    contactEmail: vendor?.contactEmail ?? '',
    contactPhone: vendor?.contactPhone ?? '',
    address: vendor?.address ?? '',
    notes: vendor?.notes ?? '',
    isActive: vendor?.isActive ?? true,
  })

  const isEditing = !!vendor

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const url = isEditing ? `/api/vendors/${vendor.id}` : '/api/vendors'
      const method = isEditing ? 'PATCH' : 'POST'

      // Build request body
      const body: Record<string, unknown> = {
        name: formData.name,
        contactEmail: formData.contactEmail || null,
        contactPhone: formData.contactPhone || null,
        address: formData.address || null,
        notes: formData.notes || null,
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
        throw new Error(data?.error || 'Failed to save vendor')
      }

      if (onSuccess) {
        onSuccess()
      } else {
        router.push('/settings/vendors')
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
          <CardTitle>{isEditing ? 'Edit Vendor' : 'Create Vendor'}</CardTitle>
          <CardDescription>
            {isEditing
              ? 'Update vendor information'
              : 'Add a new vendor/supplier'}
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
                placeholder="Acme Supplies Inc."
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactEmail">Contact Email</Label>
              <Input
                id="contactEmail"
                type="email"
                placeholder="contact@acme.com"
                value={formData.contactEmail}
                onChange={(e) => setFormData((prev) => ({ ...prev, contactEmail: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contactPhone">Contact Phone</Label>
              <Input
                id="contactPhone"
                placeholder="+1 (555) 123-4567"
                value={formData.contactPhone}
                onChange={(e) => setFormData((prev) => ({ ...prev, contactPhone: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              placeholder="123 Main St, City, State, ZIP"
              value={formData.address}
              onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Optional notes about this vendor..."
              value={formData.notes}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              rows={3}
            />
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
                Active (inactive vendors will not appear in selection lists)
              </Label>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Vendor'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
