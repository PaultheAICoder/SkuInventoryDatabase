'use client'

import { useState } from 'react'
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

interface ReceiptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  componentId: string
  componentName: string
  currentCost: string
}

export function ReceiptDialog({
  open,
  onOpenChange,
  componentId,
  componentName,
  currentCost,
}: ReceiptDialogProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    quantity: '',
    supplier: '',
    costPerUnit: currentCost,
    updateComponentCost: false,
    notes: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/transactions/receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          componentId,
          date: formData.date,
          quantity: parseFloat(formData.quantity),
          supplier: formData.supplier,
          costPerUnit: formData.costPerUnit ? parseFloat(formData.costPerUnit) : undefined,
          updateComponentCost: formData.updateComponentCost,
          notes: formData.notes || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || 'Failed to record receipt')
      }

      onOpenChange(false)
      router.refresh()

      // Reset form
      setFormData({
        date: new Date().toISOString().split('T')[0],
        quantity: '',
        supplier: '',
        costPerUnit: currentCost,
        updateComponentCost: false,
        notes: '',
      })
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
            <DialogTitle>Record Receipt</DialogTitle>
            <DialogDescription>
              Add inventory for <span className="font-medium">{componentName}</span>
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
              <Label htmlFor="quantity" className="text-right">
                Quantity *
              </Label>
              <Input
                id="quantity"
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

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="supplier" className="text-right">
                Supplier *
              </Label>
              <Input
                id="supplier"
                className="col-span-3"
                placeholder="e.g., XYZ Corp"
                value={formData.supplier}
                onChange={(e) => setFormData((prev) => ({ ...prev, supplier: e.target.value }))}
                required
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="costPerUnit" className="text-right">
                Cost/Unit
              </Label>
              <Input
                id="costPerUnit"
                type="number"
                step="0.0001"
                min="0"
                className="col-span-3"
                placeholder="Leave blank to use current cost"
                value={formData.costPerUnit}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, costPerUnit: e.target.value }))
                }
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <div className="col-span-1" />
              <div className="col-span-3 flex items-center space-x-2">
                <input
                  id="updateComponentCost"
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={formData.updateComponentCost}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, updateComponentCost: e.target.checked }))
                  }
                />
                <Label htmlFor="updateComponentCost" className="text-sm font-normal">
                  Update component cost to this value
                </Label>
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="notes" className="text-right">
                Notes
              </Label>
              <Input
                id="notes"
                className="col-span-3"
                placeholder="e.g., PO #12345"
                value={formData.notes}
                onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Recording...' : 'Record Receipt'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
