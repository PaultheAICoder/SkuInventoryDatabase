'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { LocationForm } from '@/components/features/LocationForm'
import type { LocationResponse } from '@/types/location'

export default function EditLocationPage() {
  const params = useParams()
  const id = params.id as string
  const [location, setLocation] = useState<LocationResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchLocation() {
      try {
        const res = await fetch(`/api/locations/${id}`)
        if (!res.ok) {
          throw new Error('Location not found')
        }
        const data = await res.json().catch(() => ({}))
        setLocation(data?.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setIsLoading(false)
      }
    }

    fetchLocation()
  }, [id])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/settings/locations">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Locations
            </Button>
          </Link>
        </div>
        <div className="py-10 text-center text-muted-foreground">Loading location...</div>
      </div>
    )
  }

  if (error || !location) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/settings/locations">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Locations
            </Button>
          </Link>
        </div>
        <div className="rounded-md bg-destructive/10 p-4 text-destructive">
          {error || 'Location not found'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings/locations">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Locations
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Edit Location</h1>
      </div>

      <div className="max-w-2xl">
        <LocationForm location={location} />
      </div>
    </div>
  )
}
