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

interface TransferDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  componentId: string
  componentName: string
  currentQuantity: number
}

export function TransferDialog({
  open,
  onOpenChange,
  componentId,
  componentName,
  currentQuantity,
}: TransferDialogProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([])
  const [isLoadingLocations, setIsLoadingLocations] = useState(false)

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    quantity: '',
    fromLocationId: '',
    toLocationId: '',
    notes: '',
  })

  useEffect(() => {
    if (open) {
      fetchLocations()
      // Reset form when opening
      setFormData({
        date: new Date().toISOString().split('T')[0],
        quantity: '',
        fromLocationId: '',
        toLocationId: '',
        notes: '',
      })
      setError(null)
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

    // Client-side validation
    if (formData.fromLocationId === formData.toLocationId) {
      setError('Source and destination locations must be different')
      setIsLoading(false)
      return
    }

    try {
      const res = await fetch('/api/transactions/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          componentId,
          date: formData.date,
          quantity: parseFloat(formData.quantity),
          fromLocationId: formData.fromLocationId,
          toLocationId: formData.toLocationId,
          notes: formData.notes || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.message || 'Failed to create transfer')
      }

      onOpenChange(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const isFormValid =
    formData.quantity &&
    parseFloat(formData.quantity) > 0 &&
    formData.fromLocationId &&
    formData.toLocationId &&
    formData.fromLocationId !== formData.toLocationId

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Transfer Inventory</DialogTitle>
            <DialogDescription>
              Transfer <span className="font-medium">{componentName}</span> between locations
              <br />
              Total quantity on hand: <span className="font-mono">{currentQuantity}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
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
              <Label htmlFor="fromLocation" className="text-right">
                From *
              </Label>
              <Select
                value={formData.fromLocationId}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, fromLocationId: value }))}
                disabled={isLoadingLocations}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder={isLoadingLocations ? 'Loading...' : 'Select source location'} />
                </SelectTrigger>
                <SelectContent>
                  {locations
                    .filter((loc) => loc.id !== formData.toLocationId)
                    .map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="toLocation" className="text-right">
                To *
              </Label>
              <Select
                value={formData.toLocationId}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, toLocationId: value }))}
                disabled={isLoadingLocations}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder={isLoadingLocations ? 'Loading...' : 'Select destination location'} />
                </SelectTrigger>
                <SelectContent>
                  {locations
                    .filter((loc) => loc.id !== formData.fromLocationId)
                    .map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="quantity" className="text-right">
                Quantity *
              </Label>
              <Input
                id="quantity"
                type="number"
                step="1"
                min="1"
                className="col-span-3"
                placeholder="e.g., 50"
                value={formData.quantity}
                onChange={(e) => setFormData((prev) => ({ ...prev, quantity: e.target.value }))}
                required
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="notes" className="text-right">
                Notes
              </Label>
              <Input
                id="notes"
                className="col-span-3"
                placeholder="e.g., Moving to 3PL for fulfillment"
                value={formData.notes}
                onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !isFormValid}>
              {isLoading ? 'Transferring...' : 'Transfer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
