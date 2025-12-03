'use client'

import { useState } from 'react'
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
import type { SKUResponse } from '@/types/sku'
import { salesChannels } from '@/types'

interface SKUFormProps {
  sku?: SKUResponse
  onSuccess?: () => void
}

export function SKUForm({ sku, onSuccess }: SKUFormProps) {
  const router = useRouter()
  const isEditing = !!sku

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: sku?.name ?? '',
    internalCode: sku?.internalCode ?? '',
    salesChannel: sku?.salesChannel ?? '',
    notes: sku?.notes ?? '',
    asin: sku?.externalIds?.asin ?? '',
    shopifyHandle: sku?.externalIds?.shopifyHandle ?? '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const url = isEditing ? `/api/skus/${sku.id}` : '/api/skus'
      const method = isEditing ? 'PATCH' : 'POST'

      const externalIds: Record<string, string> = {}
      if (formData.asin) externalIds.asin = formData.asin
      if (formData.shopifyHandle) externalIds.shopifyHandle = formData.shopifyHandle

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          internalCode: formData.internalCode,
          salesChannel: formData.salesChannel,
          externalIds,
          notes: formData.notes || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.message || 'Failed to save SKU')
      }

      const result = await res.json()

      if (onSuccess) {
        onSuccess()
      } else if (isEditing) {
        router.push(`/skus/${sku.id}`)
        router.refresh()
      } else {
        router.push(`/skus/${result.data.id}`)
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
          <CardTitle>{isEditing ? 'Edit SKU' : 'New SKU'}</CardTitle>
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
                placeholder="e.g., TT 3-Pack Amazon"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="internalCode">Internal Code *</Label>
              <Input
                id="internalCode"
                value={formData.internalCode}
                onChange={(e) => setFormData((prev) => ({ ...prev, internalCode: e.target.value }))}
                placeholder="e.g., TT-3PK-AMZ"
                required
                disabled={isEditing}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="salesChannel">Sales Channel *</Label>
            <Select
              value={formData.salesChannel}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, salesChannel: value }))}
              required
            >
              <SelectTrigger id="salesChannel">
                <SelectValue placeholder="Select a sales channel" />
              </SelectTrigger>
              <SelectContent>
                {salesChannels.map((channel) => (
                  <SelectItem key={channel} value={channel}>
                    {channel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="asin">Amazon ASIN</Label>
              <Input
                id="asin"
                value={formData.asin}
                onChange={(e) => setFormData((prev) => ({ ...prev, asin: e.target.value }))}
                placeholder="e.g., B0123456789"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="shopifyHandle">Shopify Handle</Label>
              <Input
                id="shopifyHandle"
                value={formData.shopifyHandle}
                onChange={(e) => setFormData((prev) => ({ ...prev, shopifyHandle: e.target.value }))}
                placeholder="e.g., tt-3-pack"
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
              placeholder="Additional notes about this SKU..."
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create SKU'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
