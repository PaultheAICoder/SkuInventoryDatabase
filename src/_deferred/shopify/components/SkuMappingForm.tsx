'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { channelTypes, CHANNEL_TYPE_DISPLAY_NAMES, type ChannelType } from '@/types/channel-mapping'
import type { MappingResponse } from '@/types/channel-mapping'

interface SkuOption {
  id: string
  name: string
  internalCode: string
}

interface SkuMappingFormProps {
  mapping?: MappingResponse | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function SkuMappingForm({ mapping, open, onOpenChange, onSuccess }: SkuMappingFormProps) {
  const isEditing = !!mapping

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skus, setSkus] = useState<SkuOption[]>([])
  const [isLoadingSkus, setIsLoadingSkus] = useState(false)

  const [formData, setFormData] = useState({
    channelType: 'shopify' as ChannelType,
    externalId: '',
    externalSku: '',
    skuId: '',
    isActive: true,
  })

  // Reset form when dialog opens/closes or mapping changes
  useEffect(() => {
    if (open) {
      if (mapping) {
        setFormData({
          channelType: mapping.channelType as ChannelType,
          externalId: mapping.externalId,
          externalSku: mapping.externalSku || '',
          skuId: mapping.skuId,
          isActive: mapping.isActive,
        })
      } else {
        setFormData({
          channelType: 'shopify',
          externalId: '',
          externalSku: '',
          skuId: '',
          isActive: true,
        })
      }
      setError(null)
    }
  }, [open, mapping])

  // Fetch SKUs when dialog opens
  useEffect(() => {
    if (open && skus.length === 0) {
      fetchSkus()
    }
  }, [open, skus.length])

  const fetchSkus = async () => {
    setIsLoadingSkus(true)
    try {
      const res = await fetch('/api/skus?pageSize=500&isActive=true')
      if (!res.ok) {
        throw new Error('Failed to load SKUs')
      }
      const data = await res.json()
      setSkus(
        data.data?.map((sku: { id: string; name: string; internalCode: string }) => ({
          id: sku.id,
          name: sku.name,
          internalCode: sku.internalCode,
        })) || []
      )
    } catch (err) {
      console.error('Error fetching SKUs:', err)
      setError('Failed to load SKUs')
    } finally {
      setIsLoadingSkus(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const url = isEditing ? `/api/shopify/mappings/${mapping.id}` : '/api/shopify/mappings'
      const method = isEditing ? 'PATCH' : 'POST'

      const body = isEditing
        ? {
            skuId: formData.skuId,
            externalSku: formData.externalSku || null,
            isActive: formData.isActive,
          }
        : {
            channelType: formData.channelType,
            externalId: formData.externalId,
            externalSku: formData.externalSku || null,
            skuId: formData.skuId,
          }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || `Failed to ${isEditing ? 'update' : 'create'} mapping`)
      }

      onSuccess()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Channel Mapping' : 'Add Channel Mapping'}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? 'Update the SKU mapping for this external channel ID.'
                : 'Map an external channel ID (e.g., Shopify variant ID) to an internal SKU.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Channel Type - only for create */}
            {!isEditing && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="channelType" className="text-right">
                  Channel
                </Label>
                <div className="col-span-3">
                  <Select
                    value={formData.channelType}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, channelType: value as ChannelType }))
                    }
                  >
                    <SelectTrigger id="channelType">
                      <SelectValue placeholder="Select channel" />
                    </SelectTrigger>
                    <SelectContent>
                      {channelTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {CHANNEL_TYPE_DISPLAY_NAMES[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* External ID - only for create */}
            {!isEditing && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="externalId" className="text-right">
                  External ID *
                </Label>
                <Input
                  id="externalId"
                  className="col-span-3"
                  value={formData.externalId}
                  onChange={(e) => setFormData((prev) => ({ ...prev, externalId: e.target.value }))}
                  placeholder="e.g., 12345678901234"
                  required
                />
              </div>
            )}

            {/* External ID display - for edit only */}
            {isEditing && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">External ID</Label>
                <div className="col-span-3 font-mono text-sm text-muted-foreground">
                  {formData.externalId}
                </div>
              </div>
            )}

            {/* External SKU (optional) */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="externalSku" className="text-right">
                External SKU
              </Label>
              <Input
                id="externalSku"
                className="col-span-3"
                value={formData.externalSku}
                onChange={(e) => setFormData((prev) => ({ ...prev, externalSku: e.target.value }))}
                placeholder="Optional - for reference"
              />
            </div>

            {/* Internal SKU */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="skuId" className="text-right">
                Internal SKU *
              </Label>
              <div className="col-span-3">
                <Select
                  value={formData.skuId}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, skuId: value }))}
                  disabled={isLoadingSkus}
                  required
                >
                  <SelectTrigger id="skuId">
                    <SelectValue
                      placeholder={isLoadingSkus ? 'Loading SKUs...' : 'Select internal SKU'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {skus.map((sku) => (
                      <SelectItem key={sku.id} value={sku.id}>
                        <span className="font-medium">{sku.name}</span>
                        <span className="ml-2 text-muted-foreground font-mono text-xs">
                          ({sku.internalCode})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Active status - only for edit */}
            {isEditing && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="isActive" className="text-right">
                  Status
                </Label>
                <div className="col-span-3 flex items-center space-x-2">
                  <Checkbox
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, isActive: checked === true }))
                    }
                  />
                  <Label htmlFor="isActive" className="font-normal">
                    Active
                  </Label>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || isLoadingSkus}>
              {isLoading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Mapping'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
