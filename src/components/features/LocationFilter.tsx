'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MapPin } from 'lucide-react'

interface Location {
  id: string
  name: string
  type: string
  isActive: boolean
}

interface LocationFilterProps {
  value?: string
  onValueChange: (locationId: string | undefined) => void
  className?: string
  disabled?: boolean
}

export function LocationFilter({
  value,
  onValueChange,
  className,
  disabled = false,
}: LocationFilterProps) {
  const { data: session } = useSession()
  const [locations, setLocations] = useState<Location[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchLocations() {
      try {
        setIsLoading(true)
        const res = await fetch('/api/locations?isActive=true&pageSize=100')
        if (res.ok) {
          const data = await res.json()
          setLocations(data.data || [])
        }
      } catch (error) {
        console.error('Error fetching locations:', error)
      } finally {
        setIsLoading(false)
      }
    }

    if (session?.user?.selectedCompanyId) {
      fetchLocations()
    }
  }, [session?.user?.selectedCompanyId])

  const handleValueChange = (newValue: string) => {
    if (newValue === 'all') {
      onValueChange(undefined)
    } else {
      onValueChange(newValue)
    }
  }

  return (
    <Select
      value={value || 'all'}
      onValueChange={handleValueChange}
      disabled={disabled || isLoading}
    >
      <SelectTrigger className={className || 'w-[180px]'} data-testid="location-filter-trigger">
        <MapPin className="h-4 w-4 mr-2 shrink-0" />
        <SelectValue placeholder={isLoading ? 'Loading...' : 'All Locations'} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Locations</SelectItem>
        {locations.map((location) => (
          <SelectItem key={location.id} value={location.id}>
            {location.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
