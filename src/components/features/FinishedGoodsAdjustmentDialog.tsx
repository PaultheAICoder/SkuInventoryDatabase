'use client'

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

interface FinishedGoodsAdjustmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  skuId: string
  skuName: string
  currentQuantity: number
}

const ADJUSTMENT_REASONS = [
  { value: 'Inventory count correction', label: 'Inventory count correction' },
  { value: 'Damaged goods', label: 'Damaged goods' },
  { value: 'Lost/missing', label: 'Lost/missing' },
  { value: 'Sample/testing', label: 'Sample/testing' },
  { value: 'Other', label: 'Other (specify in notes)' },
]

export function FinishedGoodsAdjustmentDialog({
  open,
  onOpenChange,
  skuId,
  skuName,
  currentQuantity,
}: FinishedGoodsAdjustmentDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([])
  const [isLoadingLocations, setIsLoadingLocations] = useState(false)

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    adjustmentType: 'subtract' as 'add' | 'subtract',
    quantity: '',
    reason: '',
    notes: '',
    locationId: '',
  })

  useEffect(() => {
    if (open) {
      fetchLocations()
    }
  }, [open])

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const quantity = parseFloat(formData.quantity)
      const adjustedQuantity = formData.adjustmentType === 'subtract' ? -quantity : quantity

      const res = await fetch(`/api/skus/${skuId}/inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skuId,
          locationId: formData.locationId,
          quantity: adjustedQuantity,
          reason: formData.reason,
          notes: formData.notes || null,
          date: formData.date,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.message || 'Failed to record adjustment')
      }

      // Just close the dialog - parent component handles refresh via onOpenChange callback
      onOpenChange(false)
      // Note: Do NOT call router.refresh() here - parent handles data refresh to avoid race condition

      // Reset form
      setFormData({
        date: new Date().toISOString().split('T')[0],
        adjustmentType: 'subtract',
        quantity: '',
        reason: '',
        notes: '',
        locationId: '',
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const newQuantity =
    formData.quantity && !isNaN(parseFloat(formData.quantity))
      ? formData.adjustmentType === 'subtract'
        ? currentQuantity - parseFloat(formData.quantity)
        : currentQuantity + parseFloat(formData.quantity)
      : currentQuantity

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Adjust Finished Goods</DialogTitle>
            <DialogDescription>
              Adjust finished goods inventory for <span className="font-medium">{skuName}</span>
              <br />
              Current quantity: <span className="font-mono">{currentQuantity}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="fg-adj-date" className="text-right">
                Date *
              </Label>
              <Input
                id="fg-adj-date"
                type="date"
                className="col-span-3"
                value={formData.date}
                onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
                required
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="fg-adj-type" className="text-right">
                Type *
              </Label>
              <Select
                value={formData.adjustmentType}
                onValueChange={(value: 'add' | 'subtract') =>
                  setFormData((prev) => ({ ...prev, adjustmentType: value }))
                }
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="subtract">Subtract (remove inventory)</SelectItem>
                  <SelectItem value="add">Add (increase inventory)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="fg-adj-quantity" className="text-right">
                Quantity *
              </Label>
              <Input
                id="fg-adj-quantity"
                type="number"
                step="1"
                min="1"
                className="col-span-3"
                placeholder="e.g., 10"
                value={formData.quantity}
                onChange={(e) => setFormData((prev) => ({ ...prev, quantity: e.target.value }))}
                required
              />
            </div>

            {formData.quantity && (
              <div className="grid grid-cols-4 items-center gap-4">
                <div className="col-span-1" />
                <div className="col-span-3 text-sm text-muted-foreground">
                  New quantity will be:{' '}
                  <span className={`font-mono ${newQuantity < 0 ? 'text-destructive' : ''}`}>
                    {newQuantity}
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="fg-adj-location" className="text-right">
                Location *
              </Label>
              <Select
                value={formData.locationId}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, locationId: value }))}
                disabled={isLoadingLocations}
                required
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder={isLoadingLocations ? 'Loading...' : 'Select location'} />
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
              <Label htmlFor="fg-adj-reason" className="text-right">
                Reason *
              </Label>
              <Select
                value={formData.reason}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, reason: value }))}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {ADJUSTMENT_REASONS.map((reason) => (
                    <SelectItem key={reason.value} value={reason.value}>
                      {reason.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="fg-adj-notes" className="text-right">
                Notes
              </Label>
              <Input
                id="fg-adj-notes"
                className="col-span-3"
                placeholder="Additional details..."
                value={formData.notes}
                onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !formData.reason || !formData.locationId}>
              {isLoading ? 'Recording...' : 'Record Adjustment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
