'use client'

import { useState, useEffect, useCallback } from 'react'
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
import { AlertTriangle, Package } from 'lucide-react'
import type { InsufficientInventoryItem } from '@/types/transaction'

// Sentinel value for "no selection" in Select components
// Radix UI Select requires non-empty string values
const EMPTY_VALUE = '__none__'

interface SKUOption {
  id: string
  name: string
  internalCode: string
  maxBuildableUnits: number | null
  hasActiveBom: boolean
}

interface LotAvailabilityItem {
  componentId: string
  componentName: string
  requiredQuantity: number
  availableQuantity: number
  hasLots: boolean
  selectedLots: Array<{
    lotId: string
    lotNumber: string
    quantity: number
    expiryDate: string | null
  }>
  isPooled: boolean
  isSufficient: boolean
}

interface BuildDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preselectedSkuId?: string
}

export function BuildDialog({ open, onOpenChange, preselectedSkuId }: BuildDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingSkus, setIsLoadingSkus] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [skus, setSkus] = useState<SKUOption[]>([])
  const [insufficientItems, setInsufficientItems] = useState<InsufficientInventoryItem[]>([])
  const [showWarning, setShowWarning] = useState(false)
  const [expiredLots, setExpiredLots] = useState<Array<{
    componentId: string
    componentName: string
    skuCode: string
    lotNumber: string
    expiryDate: string
    quantity: number
  }>>([])
  const [showExpiredWarning, setShowExpiredWarning] = useState(false)
  const [canOverrideExpired, setCanOverrideExpired] = useState(false)

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    skuId: preselectedSkuId || '',
    unitsToBuild: '',
    salesChannel: '',
    notes: '',
    defectCount: '',
    defectNotes: '',
    affectedUnits: '',
    locationId: '',
    outputLocationId: '',
    outputQuantity: '',
    allowExpiredLots: false,
  })
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([])
  const [isLoadingLocations, setIsLoadingLocations] = useState(false)
  const [lotAvailability, setLotAvailability] = useState<LotAvailabilityItem[]>([])
  const [showLotDetails, setShowLotDetails] = useState(false)

  // Fetch SKUs and locations when dialog opens
  useEffect(() => {
    if (open) {
      fetchSkus()
      fetchLocations()
      setFormData((prev) => ({
        ...prev,
        skuId: preselectedSkuId || '',
      }))
    }
  }, [open, preselectedSkuId])

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

  const fetchSkus = async () => {
    setIsLoadingSkus(true)
    setError(null)
    try {
      const res = await fetch('/api/skus?pageSize=100&isActive=true')
      if (res.ok) {
        const data = await res.json()
        // Filter to only SKUs with active BOMs
        setSkus(
          data.data.filter((sku: SKUOption) => sku.hasActiveBom).map((sku: SKUOption) => ({
            id: sku.id,
            name: sku.name,
            internalCode: sku.internalCode,
            maxBuildableUnits: sku.maxBuildableUnits,
            hasActiveBom: sku.hasActiveBom,
          }))
        )
      } else {
        // Handle HTTP errors (4xx, 5xx)
        const errorData = await res.json().catch(() => ({}))
        setError(errorData.error || 'Failed to load SKUs. Please try again.')
      }
    } catch (err) {
      console.error('Failed to fetch SKUs:', err)
      setError('Unable to connect. Please check your network and try again.')
    } finally {
      setIsLoadingSkus(false)
    }
  }

  const selectedSku = skus.find((s) => s.id === formData.skuId)
  const unitsToBuildNum = parseInt(formData.unitsToBuild) || 0
  const exceedsBuildable =
    selectedSku?.maxBuildableUnits != null && unitsToBuildNum > selectedSku.maxBuildableUnits

  // Fetch lot availability when SKU or units change
  const fetchLotAvailability = useCallback(async (skuId: string, units: number) => {
    if (!skuId || !units || units <= 0) {
      setLotAvailability([])
      return
    }
    try {
      const res = await fetch(`/api/skus/${skuId}/lot-availability?units=${units}`)
      if (res.ok) {
        const data = await res.json()
        setLotAvailability(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch lot availability:', err)
    }
  }, [])

  useEffect(() => {
    if (formData.skuId && unitsToBuildNum > 0) {
      fetchLotAvailability(formData.skuId, unitsToBuildNum)
    } else {
      setLotAvailability([])
    }
  }, [formData.skuId, unitsToBuildNum, fetchLotAvailability])

  const handleSubmit = async (e: React.FormEvent, forceSubmit = false) => {
    e.preventDefault()

    // Reset warning state
    if (!forceSubmit) {
      setInsufficientItems([])
      setShowWarning(false)
      setExpiredLots([])
      setShowExpiredWarning(false)
    }

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/transactions/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skuId: formData.skuId,
          date: formData.date,
          unitsToBuild: parseInt(formData.unitsToBuild),
          salesChannel: formData.salesChannel || undefined,
          notes: formData.notes || null,
          defectCount: formData.defectCount ? parseInt(formData.defectCount) : null,
          defectNotes: formData.defectNotes || null,
          affectedUnits: formData.affectedUnits ? parseInt(formData.affectedUnits) : null,
          allowInsufficientInventory: forceSubmit,
          locationId: formData.locationId || undefined,
          outputLocationId: formData.outputLocationId || undefined,
          outputQuantity: formData.outputQuantity ? parseInt(formData.outputQuantity) : undefined,
          allowExpiredLots: forceSubmit ? formData.allowExpiredLots : false,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        // Handle insufficient inventory error
        if (data?.insufficientItems && data.insufficientItems.length > 0) {
          setInsufficientItems(data.insufficientItems)
          setShowWarning(true)
          return
        }
        // Handle expired lots error
        if (data?.expiredLots && data.expiredLots.length > 0) {
          setExpiredLots(data.expiredLots)
          setShowExpiredWarning(true)
          setCanOverrideExpired(data.canOverride === true)
          return
        }
        throw new Error(data?.error || 'Failed to record build')
      }

      // Show warning if build succeeded with insufficient inventory
      if (data.data?.warning) {
        // Still close and refresh, but could show a toast
      }

      // Just close the dialog - parent component handles refresh via onOpenChange callback
      onOpenChange(false)
      // Note: Do NOT call router.refresh() here - parent handles data refresh to avoid race condition

      // Reset form
      setFormData({
        date: new Date().toISOString().split('T')[0],
        skuId: '',
        unitsToBuild: '',
        salesChannel: '',
        notes: '',
        defectCount: '',
        defectNotes: '',
        affectedUnits: '',
        locationId: '',
        outputLocationId: '',
        outputQuantity: '',
        allowExpiredLots: false,
      })
      setInsufficientItems([])
      setShowWarning(false)
      setExpiredLots([])
      setShowExpiredWarning(false)
      setCanOverrideExpired(false)
      setLotAvailability([])
      setShowLotDetails(false)
    } catch (err) {
      const errorContext = {
        error: err,
        message: err instanceof Error ? err.message : 'Unknown error',
        formData: {
          skuId: formData.skuId,
          date: formData.date,
          unitsToBuild: formData.unitsToBuild,
        },
        timestamp: new Date().toISOString(),
      }
      console.error('BuildDialog submission error:', errorContext)

      // Provide more helpful error message
      let userMessage = 'An error occurred'
      if (err instanceof Error) {
        if (err.message.includes('company')) {
          userMessage = 'Please select a company from the sidebar and try again'
        } else if (err.message.includes('network') || err.message.includes('fetch')) {
          userMessage = 'Network error. Please check your connection and try again'
        } else {
          userMessage = err.message
        }
      }
      setError(userMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleForceSubmit = (e: React.FormEvent) => {
    handleSubmit(e, true)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Record Build</DialogTitle>
            <DialogDescription>
              Build SKU units by consuming components per the active BOM
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {showWarning && insufficientItems.length > 0 && (
              <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-yellow-800">Insufficient Inventory</p>
                    <p className="text-sm text-yellow-700 mt-1">
                      The following components have insufficient inventory:
                    </p>
                    <ul className="mt-2 text-sm text-yellow-700 space-y-1">
                      {insufficientItems.map((item) => (
                        <li key={item.componentId} suppressHydrationWarning>
                          <span className="font-medium">{item.componentName}</span>:{' '}
                          Need {item.required.toLocaleString()}, have {item.available.toLocaleString()}{' '}
                          (short {item.shortage.toLocaleString()})
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setShowWarning(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={handleForceSubmit}
                        disabled={isLoading}
                      >
                        {isLoading ? 'Building...' : 'Build Anyway'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {showExpiredWarning && expiredLots.length > 0 && (
              <div className="rounded-md bg-orange-50 border border-orange-200 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-orange-800">Expired Lots Would Be Used</p>
                    <p className="text-sm text-orange-700 mt-1">
                      This build would consume inventory from expired lots:
                    </p>
                    <ul className="mt-2 text-sm text-orange-700 space-y-1">
                      {expiredLots.map((lot, idx) => (
                        <li key={idx} suppressHydrationWarning>
                          <span className="font-medium">{lot.lotNumber}</span>{' '}
                          ({lot.componentName}): {lot.quantity.toLocaleString()} units, expired {lot.expiryDate}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setShowExpiredWarning(false)
                          setExpiredLots([])
                        }}
                      >
                        Cancel
                      </Button>
                      {canOverrideExpired && (
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={(e) => {
                            setFormData((prev) => ({ ...prev, allowExpiredLots: true }))
                            setShowExpiredWarning(false)
                            handleSubmit(e, true)
                          }}
                          disabled={isLoading}
                        >
                          {isLoading ? 'Building...' : 'Use Expired Lots'}
                        </Button>
                      )}
                    </div>
                    {!canOverrideExpired && (
                      <p className="mt-2 text-sm text-red-600">
                        Override is not allowed. Contact an admin to enable expired lot override.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="date" className="text-right">
                Date *
              </Label>
              <Input
                id="date"
                type="date"
                className="col-span-3"
                value={formData.date}
                onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
                required
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="skuId" className="text-right">
                SKU *
              </Label>
              <div className="col-span-3">
                <Select
                  value={formData.skuId}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, skuId: value }))}
                  disabled={isLoadingSkus}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isLoadingSkus ? 'Loading SKUs...' : 'Select SKU'} />
                  </SelectTrigger>
                  <SelectContent>
                    {skus.map((sku) => (
                      <SelectItem key={sku.id} value={sku.id}>
                        <div className="flex items-center justify-between gap-2">
                          <span>{sku.name}</span>
                          <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                            ({sku.maxBuildableUnits?.toLocaleString() ?? '0'} buildable)
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedSku && (
                  <p className="text-xs text-muted-foreground mt-1" suppressHydrationWarning>
                    Max buildable: {selectedSku.maxBuildableUnits?.toLocaleString() ?? '0'} units
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="unitsToBuild" className="text-right">
                Units *
              </Label>
              <div className="col-span-3">
                <Input
                  id="unitsToBuild"
                  type="number"
                  step="1"
                  min="1"
                  className={exceedsBuildable ? 'border-yellow-500' : ''}
                  placeholder="e.g., 10"
                  value={formData.unitsToBuild}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, unitsToBuild: e.target.value }))
                  }
                  required
                />
                {exceedsBuildable && (
                  <p className="text-xs text-yellow-600 mt-1" suppressHydrationWarning>
                    Exceeds max buildable units ({selectedSku?.maxBuildableUnits?.toLocaleString()})
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="salesChannel" className="text-right">
                Channel
              </Label>
              <Input
                id="salesChannel"
                className="col-span-3"
                placeholder="e.g., Amazon, Shopify"
                value={formData.salesChannel}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, salesChannel: e.target.value }))
                }
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="notes" className="text-right">
                Notes
              </Label>
              <Input
                id="notes"
                className="col-span-3"
                placeholder="e.g., Order batch #123"
                value={formData.notes}
                onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="location" className="text-right">
                Location
              </Label>
              <Select
                value={formData.locationId}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, locationId: value }))}
                disabled={isLoadingLocations}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder={isLoadingLocations ? 'Loading...' : 'Default location'} />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="outputLocation" className="text-right">
                Output To
              </Label>
              <Select
                value={formData.outputLocationId || EMPTY_VALUE}
                onValueChange={(value) => setFormData((prev) => ({
                  ...prev,
                  outputLocationId: value === EMPTY_VALUE ? '' : value
                }))}
                disabled={isLoadingLocations}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder={isLoadingLocations ? 'Loading...' : 'Select finished goods location (optional)'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EMPTY_VALUE}>No finished goods output</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formData.outputLocationId && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="outputQuantity" className="text-right">
                  Output Qty
                </Label>
                <Input
                  id="outputQuantity"
                  type="number"
                  step="1"
                  min="1"
                  className="col-span-3"
                  placeholder={`Defaults to ${formData.unitsToBuild || 'units built'}`}
                  value={formData.outputQuantity}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, outputQuantity: e.target.value }))
                  }
                />
              </div>
            )}

            {/* Defect Tracking (collapsible) */}
            <details className="col-span-4">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                Defect Tracking (optional)
              </summary>
              <div className="mt-4 space-y-4 pl-4 border-l-2 border-muted">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="defectCount" className="text-right">
                    Defects
                  </Label>
                  <Input
                    id="defectCount"
                    type="number"
                    min="0"
                    step="1"
                    className="col-span-3"
                    placeholder="Number of defective units"
                    value={formData.defectCount}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, defectCount: e.target.value }))
                    }
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="affectedUnits" className="text-right">
                    Affected
                  </Label>
                  <Input
                    id="affectedUnits"
                    type="number"
                    min="0"
                    step="1"
                    className="col-span-3"
                    placeholder="Number of affected units"
                    value={formData.affectedUnits}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, affectedUnits: e.target.value }))
                    }
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="defectNotes" className="text-right">
                    Notes
                  </Label>
                  <Input
                    id="defectNotes"
                    className="col-span-3"
                    placeholder="Description of defects..."
                    value={formData.defectNotes}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, defectNotes: e.target.value }))
                    }
                  />
                </div>
              </div>
            </details>

            {/* Lot Selection (collapsible) */}
            {lotAvailability.some((la) => la.hasLots) && (
              <details className="col-span-4" open={showLotDetails}>
                <summary
                  className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-2"
                  onClick={(e) => {
                    e.preventDefault()
                    setShowLotDetails(!showLotDetails)
                  }}
                >
                  <Package className="h-4 w-4" />
                  Lot Selection (FEFO auto-selected)
                </summary>
                <div className="mt-4 space-y-4 pl-4 border-l-2 border-muted">
                  {lotAvailability
                    .filter((la) => la.hasLots)
                    .map((comp) => (
                      <div key={comp.componentId} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">{comp.componentName}</p>
                          {!comp.isSufficient && (
                            <span className="text-xs text-yellow-600 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Insufficient lot inventory
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                          Required: {comp.requiredQuantity.toLocaleString()} | Available across lots:{' '}
                          {comp.availableQuantity.toLocaleString()}
                        </p>
                        <div className="text-xs space-y-1">
                          {comp.selectedLots.map((lot) => (
                            <div key={lot.lotId} className="flex items-center gap-2 pl-2">
                              <span className="font-mono bg-muted px-1 rounded">{lot.lotNumber}</span>
                              <span className="text-muted-foreground" suppressHydrationWarning>
                                ({lot.quantity.toLocaleString()} units)
                              </span>
                              {lot.expiryDate && (
                                <span className="text-muted-foreground">Expires: {lot.expiryDate}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  <p className="text-xs text-muted-foreground italic">
                    Lots are automatically selected using FEFO (First Expiry First Out).
                  </p>
                </div>
              </details>
            )}
          </div>

          {!showWarning && !showExpiredWarning && (
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLoading || !formData.skuId || !formData.unitsToBuild}
              >
                {isLoading ? 'Building...' : 'Record Build'}
              </Button>
            </DialogFooter>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
