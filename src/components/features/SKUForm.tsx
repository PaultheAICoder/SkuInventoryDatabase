'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
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
import type { SKUResponse } from '@/types/sku'
import type { ComponentResponse } from '@/types/component'
import { salesChannels } from '@/types'
import { parseApiError, type FieldErrors } from '@/lib/api-errors'

interface BOMLineState {
  componentId: string
  quantityPerUnit: string
}

interface SKUFormProps {
  sku?: SKUResponse
  onSuccess?: () => void
}

const EMPTY_VALUE = '__none__'

export function SKUForm({ sku, onSuccess }: SKUFormProps) {
  const router = useRouter()
  const { data: session } = useSession()
  const isEditing = !!sku

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [components, setComponents] = useState<ComponentResponse[]>([])
  const [loadingComponents, setLoadingComponents] = useState(true)

  const [formData, setFormData] = useState({
    name: sku?.name ?? '',
    internalCode: sku?.internalCode ?? '',
    salesChannel: sku?.salesChannel ?? '',
    notes: sku?.notes ?? '',
    asin: sku?.externalIds?.asin ?? '',
    shopifyHandle: sku?.externalIds?.shopifyHandle ?? '',
  })

  // Initialize 15 empty BOM line slots
  const [bomLines, setBomLines] = useState<BOMLineState[]>(
    Array(15).fill(null).map(() => ({ componentId: '', quantityPerUnit: '1' }))
  )

  // Fetch available components on mount
  useEffect(() => {
    async function fetchComponents() {
      try {
        const res = await fetch('/api/components?isActive=true&pageSize=100')
        if (res.ok) {
          const data = await res.json().catch(() => ({}))
          setComponents(data?.data || [])
        }
      } catch (err) {
        console.error('Failed to fetch components:', err)
      } finally {
        setLoadingComponents(false)
      }
    }
    fetchComponents()
  }, [])

  // Update a BOM line field
  const updateBomLine = (index: number, field: 'componentId' | 'quantityPerUnit', value: string) => {
    setBomLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line
        if (field === 'componentId') {
          // Handle the "None" selection
          const newValue = value === EMPTY_VALUE ? '' : value
          return { ...line, componentId: newValue }
        }
        return { ...line, [field]: value }
      })
    )
  }

  // Count selected components
  const selectedCount = bomLines.filter((line) => line.componentId).length

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

      // Filter BOM lines to only those with a component selected
      const selectedBomLines = bomLines
        .filter((line) => line.componentId)
        .map((line) => ({
          componentId: line.componentId,
          quantityPerUnit: line.quantityPerUnit || '1',
        }))

      // Build request body
      const body: Record<string, unknown> = {
        name: formData.name,
        internalCode: formData.internalCode,
        salesChannel: formData.salesChannel,
        externalIds,
        notes: formData.notes || null,
      }

      // Include BOM lines only for new SKUs if any selected
      if (!isEditing && selectedBomLines.length > 0) {
        body.bomLines = selectedBomLines
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const parsed = parseApiError(data)

        setFieldErrors(parsed.fieldErrors)
        setError(parsed.message)

        // Show toast for immediate feedback
        toast.error('Failed to save SKU', {
          description: parsed.message,
        })
        return
      }

      // Clear field errors on successful submit
      setFieldErrors({})

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
      // Handle network errors or unexpected failures
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
      toast.error('Failed to save SKU', {
        description: message,
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{isEditing ? 'Edit SKU' : 'New SKU'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Name */}
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

          {/* Internal Code */}
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
            {fieldErrors.internalCode && (
              <p className="text-sm text-destructive">{fieldErrors.internalCode}</p>
            )}
          </div>

          {/* Company (read-only from session) */}
          <div className="space-y-2">
            <Label>Company</Label>
            <Input
              value={session?.user?.selectedCompanyName || 'Loading...'}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              From your current session. Change via the header selector.
            </p>
          </div>

          {/* Brand (read-only from session) */}
          <div className="space-y-2">
            <Label>Brand</Label>
            <Input
              value={session?.user?.selectedBrandName || 'All Brands'}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              From your current session. Change via the header selector.
            </p>
          </div>

          {/* Sales Channel */}
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

          {/* ASIN */}
          <div className="space-y-2">
            <Label htmlFor="asin">Amazon ASIN</Label>
            <Input
              id="asin"
              value={formData.asin}
              onChange={(e) => setFormData((prev) => ({ ...prev, asin: e.target.value }))}
              placeholder="e.g., B0123456789"
            />
          </div>

          {/* Shopify Handle */}
          <div className="space-y-2">
            <Label htmlFor="shopifyHandle">Shopify Handle</Label>
            <Input
              id="shopifyHandle"
              value={formData.shopifyHandle}
              onChange={(e) => setFormData((prev) => ({ ...prev, shopifyHandle: e.target.value }))}
              placeholder="e.g., tt-3-pack"
            />
          </div>

          {/* Notes */}
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

          {/* BOM Components Section - Only show for new SKUs */}
          {!isEditing && (
            <>
              <hr className="my-6" />

              <div className="space-y-4">
                <div className="space-y-1">
                  <Label className="text-base font-medium">BOM Components (Optional)</Label>
                  <p className="text-sm text-muted-foreground">
                    Select components to create a BOM version with this SKU.
                    Components are filtered by your selected company/brand.
                  </p>
                  {selectedCount > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {selectedCount} of 15 components selected
                    </p>
                  )}
                </div>

                {loadingComponents ? (
                  <p className="text-sm text-muted-foreground">Loading components...</p>
                ) : components.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No active components found. Create components first to add BOM lines.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {bomLines.map((line, index) => (
                      <div key={index} className="flex gap-2 items-center">
                        <div className="flex-1">
                          <Select
                            value={line.componentId || EMPTY_VALUE}
                            onValueChange={(value) => updateBomLine(index, 'componentId', value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={`Component ${index + 1}`} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={EMPTY_VALUE}>-- None --</SelectItem>
                              {components.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name} ({c.skuCode})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="w-24">
                          <Input
                            type="text"
                            value={line.quantityPerUnit}
                            onChange={(e) => updateBomLine(index, 'quantityPerUnit', e.target.value)}
                            placeholder="Qty"
                            disabled={!line.componentId}
                            title="Quantity per unit (supports fractions like 1/45)"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
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
