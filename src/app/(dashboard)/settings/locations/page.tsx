'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LocationTable } from '@/components/features/LocationTable'
import { MapPin, Search } from 'lucide-react'
import { LOCATION_TYPES, LOCATION_TYPE_DISPLAY_NAMES } from '@/types/location'
import type { LocationResponse } from '@/types/location'

export default function LocationsPage() {
  const [locations, setLocations] = useState<LocationResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [activeFilter, setActiveFilter] = useState<string>('')

  const fetchLocations = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (typeFilter) params.set('type', typeFilter)
      if (activeFilter) params.set('isActive', activeFilter)

      const res = await fetch(`/api/locations?${params.toString()}`)
      if (!res.ok) {
        throw new Error('Failed to load locations')
      }
      const data = await res.json().catch(() => ({}))
      setLocations(data?.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [search, typeFilter, activeFilter])

  useEffect(() => {
    fetchLocations()
  }, [fetchLocations])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchLocations()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Location Management</h1>
          <p className="text-muted-foreground">Manage inventory locations</p>
        </div>
        <Button asChild>
          <Link href="/settings/locations/new">
            <MapPin className="mr-2 h-4 w-4" />
            Add Location
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search locations..."
              className="pl-8 w-[250px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>

        <Select value={typeFilter || 'all'} onValueChange={(v) => setTypeFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {LOCATION_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {LOCATION_TYPE_DISPLAY_NAMES[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={activeFilter || 'all'} onValueChange={(v) => setActiveFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-md bg-destructive/10 p-4 text-destructive">{error}</div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="py-10 text-center text-muted-foreground">Loading locations...</div>
      )}

      {/* Location Table */}
      {!isLoading && !error && (
        <LocationTable locations={locations} onRefresh={fetchLocations} />
      )}
    </div>
  )
}
