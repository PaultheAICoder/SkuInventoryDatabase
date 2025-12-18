'use client'

/**
 * ASIN Mapping Modal Component
 *
 * Modal for selecting SKU to map to an ASIN.
 */

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Loader2, Search, Check } from 'lucide-react'

interface Brand {
  id: string
  name: string
}

interface SKU {
  id: string
  internalCode: string
  name: string
}

interface UnmappedAsin {
  asin: string
  productName: string | null
  brandId: string
  brandName: string
  suggestions: Array<{ id: string; sku: string; name: string; similarity: number }>
}

interface AsinMappingModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'map-unmapped' | 'manual-entry'
  unmappedAsin?: UnmappedAsin | null
  brands: Brand[]
  onSuccess: () => void
}

export function AsinMappingModal({
  open,
  onOpenChange,
  mode,
  unmappedAsin,
  brands,
  onSuccess,
}: AsinMappingModalProps) {
  const [selectedSku, setSelectedSku] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState('')
  const [skus, setSkus] = useState<SKU[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manualAsin, setManualAsin] = useState('')
  const [selectedBrandId, setSelectedBrandId] = useState<string>('')
  const [asinError, setAsinError] = useState<string | null>(null)

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      setSelectedSku('')
      setSearchTerm('')
      setError(null)
      setManualAsin('')
      setAsinError(null)
      // Pre-select brand from unmappedAsin if in map-unmapped mode
      if (mode === 'map-unmapped' && unmappedAsin) {
        setSelectedBrandId(unmappedAsin.brandId)
      } else {
        setSelectedBrandId('')
      }
      fetchSkus()
    }
  }, [open, mode, unmappedAsin])

  const validateAsin = (asin: string): string | null => {
    if (!asin) return null // Don't show error for empty
    if (!/^[A-Z0-9]{10}$/i.test(asin)) {
      return 'ASIN must be 10 alphanumeric characters'
    }
    return null
  }

  const handleAsinChange = (value: string) => {
    const upperValue = value.toUpperCase()
    setManualAsin(upperValue)
    setAsinError(validateAsin(upperValue))
  }

  const fetchSkus = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/skus?limit=500')
      if (response.ok) {
        const data = await response.json()
        setSkus(data.data || [])
      }
    } catch {
      // SKUs are required for mapping
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    // Determine ASIN and brandId based on mode
    const asin = mode === 'manual-entry' ? manualAsin : unmappedAsin?.asin
    const brandId = mode === 'manual-entry' ? selectedBrandId : unmappedAsin?.brandId

    if (!asin || !brandId || !selectedSku) {
      if (!asin) {
        setError('Please enter an ASIN')
      } else if (!brandId) {
        setError('Please select a brand')
      } else {
        setError('Please select a SKU')
      }
      return
    }

    // Validate ASIN format for manual entry
    if (mode === 'manual-entry') {
      const validationError = validateAsin(asin)
      if (validationError) {
        setError(validationError)
        return
      }
    }

    setSaving(true)
    setError(null)

    try {
      const response = await fetch('/api/asin-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandId,
          asin,
          skuId: selectedSku,
          productName: mode === 'map-unmapped' ? unmappedAsin?.productName : null,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create mapping')
      }

      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create mapping')
    } finally {
      setSaving(false)
    }
  }

  // Filter SKUs by search term
  const filteredSkus = skus.filter(sku =>
    sku.internalCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (sku.name?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
  )

  // Sort by suggestions first
  const sortedSkus = filteredSkus.sort((a, b) => {
    const aSuggested = unmappedAsin?.suggestions.some(s => s.id === a.id) ? 1 : 0
    const bSuggested = unmappedAsin?.suggestions.some(s => s.id === b.id) ? 1 : 0
    return bSuggested - aSuggested
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {mode === 'manual-entry' ? 'Add ASIN Mapping' : 'Map ASIN to SKU'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'manual-entry'
              ? 'Enter an ASIN and select a brand and SKU to create a mapping.'
              : 'Select an internal SKU to map to this Amazon ASIN.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-4 py-4">
          {/* ASIN Field */}
          {mode === 'manual-entry' ? (
            <div className="space-y-2">
              <Label htmlFor="asin-input">ASIN</Label>
              <Input
                id="asin-input"
                placeholder="e.g., B07XXXXXXXXX"
                value={manualAsin}
                onChange={(e) => handleAsinChange(e.target.value)}
                maxLength={10}
              />
              {asinError && (
                <p className="text-sm text-destructive">{asinError}</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label>ASIN</Label>
              <div className="rounded-md bg-muted p-3">
                <div className="font-mono font-medium">{unmappedAsin?.asin}</div>
                {unmappedAsin?.productName && (
                  <div className="text-sm text-muted-foreground mt-1">
                    {unmappedAsin.productName}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Brand Field */}
          {mode === 'manual-entry' ? (
            <div className="space-y-2">
              <Label>Brand</Label>
              <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a brand" />
                </SelectTrigger>
                <SelectContent>
                  {brands.map(brand => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Brand</Label>
              <div className="rounded-md bg-muted p-3">
                {unmappedAsin?.brandName}
              </div>
            </div>
          )}

          {/* SKU Selection */}
          <div className="space-y-2">
            <Label htmlFor="sku-search">Select SKU</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="sku-search"
                placeholder="Search SKUs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="max-h-[200px] overflow-y-auto rounded-md border">
                {sortedSkus.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No SKUs found
                  </div>
                ) : (
                  sortedSkus.slice(0, 50).map(sku => {
                    const isSuggested = unmappedAsin?.suggestions.some(s => s.id === sku.id)
                    const isSelected = selectedSku === sku.id

                    return (
                      <button
                        key={sku.id}
                        type="button"
                        onClick={() => setSelectedSku(sku.id)}
                        className={`w-full flex items-center justify-between p-3 text-left hover:bg-muted transition-colors border-b last:border-b-0 ${
                          isSelected ? 'bg-primary/10' : ''
                        }`}
                      >
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {sku.internalCode}
                            {isSuggested && (
                              <span className="text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded">
                                Suggested
                              </span>
                            )}
                          </div>
                          {sku.name && (
                            <div className="text-sm text-muted-foreground">{sku.name}</div>
                          )}
                        </div>
                        {isSelected && <Check className="h-4 w-4 text-primary" />}
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              saving ||
              !selectedSku ||
              (mode === 'manual-entry' && (!manualAsin || !selectedBrandId || !!asinError))
            }
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Mapping'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
