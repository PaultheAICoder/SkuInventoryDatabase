'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'

interface LineMappingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderId: string
  line: {
    id: string
    title: string
    shopifySku: string | null
    quantity: number
    mappedSkuId: string | null
  }
  onSuccess: () => void
}

interface SkuOption {
  id: string
  name: string
  internalCode: string
}

export function LineMappingDialog({
  open,
  onOpenChange,
  orderId,
  line,
  onSuccess,
}: LineMappingDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skus, setSkus] = useState<SkuOption[]>([])
  const [isLoadingSkus, setIsLoadingSkus] = useState(false)
  const [selectedSkuId, setSelectedSkuId] = useState<string>(line.mappedSkuId || '')
  const [search, setSearch] = useState('')
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (open) {
      fetchSkus()
      setSelectedSkuId(line.mappedSkuId || '')
      setError(null)
      setSearch('')
    }
  }, [open, line.mappedSkuId])

  const fetchSkus = async (searchQuery?: string) => {
    setIsLoadingSkus(true)
    try {
      const params = new URLSearchParams({
        pageSize: '100',
        isActive: 'true',
      })
      if (searchQuery) {
        params.set('search', searchQuery)
      }
      const res = await fetch(`/api/skus?${params}`)
      if (res.ok) {
        const data = await res.json()
        setSkus(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch SKUs:', err)
    } finally {
      setIsLoadingSkus(false)
    }
  }

  const handleSearchChange = (value: string) => {
    setSearch(value)
    // Debounce search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      fetchSkus(value)
    }, 300)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSkuId) return

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/shopify/orders/${orderId}/lines/${line.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappedSkuId: selectedSkuId }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to update mapping')
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
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Map Line Item to SKU</DialogTitle>
            <DialogDescription>
              Select an internal SKU for this Shopify line item.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label>Line Item</Label>
              <div className="rounded-md bg-muted p-3 text-sm">
                <p className="font-medium">{line.title}</p>
                {line.shopifySku && (
                  <p className="text-muted-foreground font-mono text-xs">
                    Shopify SKU: {line.shopifySku}
                  </p>
                )}
                <p className="text-muted-foreground">Qty: {line.quantity}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="search">Search SKUs</Label>
              <Input
                id="search"
                placeholder="Search by name or code..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sku">Internal SKU *</Label>
              <Select
                value={selectedSkuId}
                onValueChange={setSelectedSkuId}
                disabled={isLoadingSkus}
              >
                <SelectTrigger>
                  <SelectValue placeholder={isLoadingSkus ? 'Loading...' : 'Select SKU'} />
                </SelectTrigger>
                <SelectContent>
                  {skus.map((sku) => (
                    <SelectItem key={sku.id} value={sku.id}>
                      <div className="flex flex-col">
                        <span>{sku.name}</span>
                        <span className="text-xs text-muted-foreground font-mono">
                          {sku.internalCode}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !selectedSkuId}>
              {isLoading ? 'Saving...' : 'Save Mapping'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
