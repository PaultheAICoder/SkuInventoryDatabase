'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
import { AlertTriangle } from 'lucide-react'
import type { InsufficientInventoryItem } from '@/types/transaction'

interface SKUOption {
  id: string
  name: string
  internalCode: string
  maxBuildableUnits: number | null
  hasActiveBom: boolean
}

interface BuildDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preselectedSkuId?: string
}

export function BuildDialog({ open, onOpenChange, preselectedSkuId }: BuildDialogProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingSkus, setIsLoadingSkus] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [skus, setSkus] = useState<SKUOption[]>([])
  const [insufficientItems, setInsufficientItems] = useState<InsufficientInventoryItem[]>([])
  const [showWarning, setShowWarning] = useState(false)

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    skuId: preselectedSkuId || '',
    unitsToBuild: '',
    salesChannel: '',
    notes: '',
    defectCount: '',
    defectNotes: '',
    affectedUnits: '',
  })

  // Fetch SKUs when dialog opens
  useEffect(() => {
    if (open) {
      fetchSkus()
      setFormData((prev) => ({
        ...prev,
        skuId: preselectedSkuId || '',
      }))
    }
  }, [open, preselectedSkuId])

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

  const handleSubmit = async (e: React.FormEvent, forceSubmit = false) => {
    e.preventDefault()

    // Reset warning state
    if (!forceSubmit) {
      setInsufficientItems([])
      setShowWarning(false)
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
        throw new Error(data?.error || 'Failed to record build')
      }

      // Show warning if build succeeded with insufficient inventory
      if (data.data?.warning) {
        // Still close and refresh, but could show a toast
      }

      onOpenChange(false)
      router.refresh()

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
      })
      setInsufficientItems([])
      setShowWarning(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
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
          </div>

          {!showWarning && (
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
