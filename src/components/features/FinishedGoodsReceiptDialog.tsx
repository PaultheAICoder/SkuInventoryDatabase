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
import { toLocalDateString } from '@/lib/utils'

interface FinishedGoodsReceiptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  skuId: string
  skuName: string
  currentQuantity: number
}

export function FinishedGoodsReceiptDialog({
  open,
  onOpenChange,
  skuId,
  skuName,
  currentQuantity,
}: FinishedGoodsReceiptDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([])
  const [isLoadingLocations, setIsLoadingLocations] = useState(false)

  const [formData, setFormData] = useState({
    date: toLocalDateString(new Date()),
    quantity: '',
    source: '',
    costPerUnit: '',
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
      const res = await fetch(`/api/skus/${skuId}/inventory/receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: formData.locationId,
          quantity: parseFloat(formData.quantity),
          source: formData.source,
          costPerUnit: formData.costPerUnit ? parseFloat(formData.costPerUnit) : undefined,
          notes: formData.notes || null,
          date: formData.date,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.message || 'Failed to record receipt')
      }

      // Just close the dialog - parent component handles refresh via onOpenChange callback
      onOpenChange(false)
      // Note: Do NOT call router.refresh() here - parent handles data refresh to avoid race condition

      // Reset form
      setFormData({
        date: toLocalDateString(new Date()),
        quantity: '',
        source: '',
        costPerUnit: '',
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
      ? currentQuantity + parseFloat(formData.quantity)
      : currentQuantity

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Receive Finished Goods</DialogTitle>
            <DialogDescription>
              Add finished goods inventory for <span className="font-medium">{skuName}</span>
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
              <Label htmlFor="fg-rcpt-date" className="text-right">
                Date *
              </Label>
              <Input
                id="fg-rcpt-date"
                type="date"
                className="col-span-3"
                value={formData.date}
                onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
                required
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="fg-rcpt-quantity" className="text-right">
                Quantity *
              </Label>
              <Input
                id="fg-rcpt-quantity"
                type="number"
                step="1"
                min="1"
                className="col-span-3"
                placeholder="e.g., 100"
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
                  <span className="font-mono">{newQuantity}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="fg-rcpt-location" className="text-right">
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
              <Label htmlFor="fg-rcpt-source" className="text-right">
                Source *
              </Label>
              <Input
                id="fg-rcpt-source"
                className="col-span-3"
                placeholder="e.g., Customer Return, Correction"
                value={formData.source}
                onChange={(e) => setFormData((prev) => ({ ...prev, source: e.target.value }))}
                required
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="fg-rcpt-cost" className="text-right">
                Cost/Unit
              </Label>
              <Input
                id="fg-rcpt-cost"
                type="number"
                step="0.01"
                min="0"
                className="col-span-3"
                placeholder="Leave blank if not applicable"
                value={formData.costPerUnit}
                onChange={(e) => setFormData((prev) => ({ ...prev, costPerUnit: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="fg-rcpt-notes" className="text-right">
                Notes
              </Label>
              <Input
                id="fg-rcpt-notes"
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
            <Button type="submit" disabled={isLoading || !formData.source || !formData.locationId}>
              {isLoading ? 'Recording...' : 'Record Receipt'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
