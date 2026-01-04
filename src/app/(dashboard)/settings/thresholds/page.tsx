'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { ThresholdSettingsForm } from '@/components/features/ThresholdSettingsForm'
import type { RequiredThresholds } from '@/lib/recommendation-utils'

interface ThresholdsResponse {
  brandId: string
  brandName: string
  thresholds: RequiredThresholds
  brandOverrides: Partial<RequiredThresholds> | null
  defaults: RequiredThresholds
}

export default function ThresholdsSettingsPage() {
  const { data: session, status } = useSession()
  const [data, setData] = useState<ThresholdsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchThresholds = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/thresholds')
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to load thresholds')
      }
      const result = await res.json()
      setData(result.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'loading') return
    if (session?.user?.selectedBrandId) {
      fetchThresholds()
    } else {
      setIsLoading(false)
    }
  }, [status, session?.user?.selectedBrandId, fetchThresholds])

  const handleSave = async (thresholds: Partial<RequiredThresholds>) => {
    const res = await fetch('/api/thresholds', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(thresholds),
    })

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      throw new Error(errorData.error || 'Failed to save thresholds')
    }

    await fetchThresholds()
  }

  if (status === 'loading' || isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Recommendation Thresholds</h1>
          <p className="text-muted-foreground">Configure thresholds for recommendation generation</p>
        </div>
        <div className="py-10 text-center text-muted-foreground">Loading thresholds...</div>
      </div>
    )
  }

  if (!session?.user?.selectedBrandId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Recommendation Thresholds</h1>
          <p className="text-muted-foreground">Configure thresholds for recommendation generation</p>
        </div>
        <div className="rounded-md bg-yellow-50 border border-yellow-200 p-4 text-yellow-800">
          Please select a brand to configure thresholds.
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Recommendation Thresholds</h1>
          <p className="text-muted-foreground">Configure thresholds for recommendation generation</p>
        </div>
        <div className="rounded-md bg-destructive/10 p-4 text-destructive">
          {error || 'Failed to load thresholds'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Recommendation Thresholds</h1>
        <p className="text-muted-foreground">
          Configure thresholds for {data.brandName} recommendation generation
        </p>
      </div>

      <div className="max-w-4xl">
        <ThresholdSettingsForm
          brandName={data.brandName}
          thresholds={data.thresholds}
          defaults={data.defaults}
          onSave={handleSave}
        />
      </div>
    </div>
  )
}
