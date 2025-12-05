'use client'

import { useState, useEffect } from 'react'
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
import { AlertTriangle, Loader2 } from 'lucide-react'

interface Location {
  id: string
  name: string
}

interface LocationSelectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onLocationSelected: (locationId: string) => void
  title?: string
  description?: string
}

export function LocationSelectionDialog({
  open,
  onOpenChange,
  onLocationSelected,
  title = 'Location Required',
  description = 'Please select a location to continue with the import.',
}: LocationSelectionDialogProps) {
  const { data: session } = useSession()
  const [selectedLocationId, setSelectedLocationId] = useState<string>('')
  const [locations, setLocations] = useState<Location[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch locations when dialog opens
  useEffect(() => {
    if (open && session?.user?.selectedCompanyId) {
      fetchLocations()
    }
  }, [open, session?.user?.selectedCompanyId])

  const fetchLocations = async () => {
    setIsFetching(true)
    setError(null)
    try {
      const res = await fetch('/api/locations')
      if (!res.ok) {
        throw new Error('Failed to fetch locations')
      }
      const data = await res.json()
      setLocations(data.data || [])
    } catch (err) {
      console.error('Error fetching locations:', err)
      setError('Failed to load locations. Please try again.')
    } finally {
      setIsFetching(false)
    }
  }

  const handleClose = () => {
    setSelectedLocationId('')
    setError(null)
    onOpenChange(false)
  }

  const handleConfirm = () => {
    if (!selectedLocationId) {
      setError('Please select a location')
      return
    }

    setIsLoading(true)
    // Unlike company/brand, location doesn't need a switch API - just return selected ID
    onLocationSelected(selectedLocationId)
    handleClose()
    setIsLoading(false)
  }

  // Handle case where fetching or no locations available
  if (isFetching) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading Locations
            </DialogTitle>
            <DialogDescription>
              Please wait while we fetch available locations...
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )
  }

  if (locations.length === 0 && !isFetching) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              No Locations Available
            </DialogTitle>
            <DialogDescription>
              No locations are configured for your company. Please contact an administrator to create a location, or go to Settings &gt; Locations to create one.
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
            <Label htmlFor="location-select" className="text-right">
              Location
            </Label>
            <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
              <SelectTrigger id="location-select" className="col-span-3">
                <SelectValue placeholder="Select a location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
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
          <Button onClick={handleConfirm} disabled={isLoading || !selectedLocationId}>
            {isLoading ? 'Setting...' : 'Continue with Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
