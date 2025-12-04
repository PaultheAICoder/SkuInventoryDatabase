'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

interface BrandSelectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onBrandSelected: (brandId: string) => void
  title?: string
  description?: string
}

export function BrandSelectionDialog({
  open,
  onOpenChange,
  onBrandSelected,
  title = 'Brand Required',
  description = 'Please select a brand to continue with the import.',
}: BrandSelectionDialogProps) {
  const { data: session, update: updateSession } = useSession()
  const [selectedBrandId, setSelectedBrandId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const brands = session?.user?.brands || []

  const handleClose = () => {
    setSelectedBrandId('')
    setError(null)
    onOpenChange(false)
  }

  const handleConfirm = async () => {
    if (!selectedBrandId) {
      setError('Please select a brand')
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/brands/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId: selectedBrandId }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to set brand')
      }

      const data = await res.json()

      // Update session with new brand
      await updateSession({
        selectedBrandId: data.data.selectedBrandId,
        selectedBrandName: data.data.selectedBrandName,
      })

      toast.success(`Brand set to ${data.data.selectedBrandName}`)

      // Notify parent and close
      onBrandSelected(selectedBrandId)
      handleClose()
    } catch (err) {
      console.error('Error setting brand:', err)
      setError(err instanceof Error ? err.message : 'Failed to set brand. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Handle case where user has no brands
  if (brands.length === 0) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              No Brands Available
            </DialogTitle>
            <DialogDescription>
              No brands are configured for your company. Please contact an administrator to create a brand, or go to Settings &gt; Brands to create one.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handleClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="brand-select" className="text-right">
              Brand
            </Label>
            <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
              <SelectTrigger id="brand-select" className="col-span-3">
                <SelectValue placeholder="Select a brand" />
              </SelectTrigger>
              <SelectContent>
                {brands.map((brand) => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading || !selectedBrandId}>
            {isLoading ? 'Setting...' : 'Continue with Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
