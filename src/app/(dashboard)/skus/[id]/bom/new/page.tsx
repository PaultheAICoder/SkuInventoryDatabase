'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { BOMVersionForm } from '@/components/features/BOMVersionForm'

export default function NewBOMPage() {
  const router = useRouter()
  const params = useParams()
  const skuId = params.id as string
  const [skuName, setSkuName] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchSKU() {
      try {
        const res = await fetch(`/api/skus/${skuId}`)
        if (!res.ok) {
          throw new Error('SKU not found')
        }
        const data = await res.json()
        setSkuName(data.data.name)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load SKU')
      } finally {
        setIsLoading(false)
      }
    }

    fetchSKU()
  }, [skuId])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>
        <p>Loading...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>
        <p className="text-red-500">{error || 'SKU not found'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New BOM Version</h1>
          <p className="text-muted-foreground">Define bill of materials for {skuName}</p>
        </div>
      </div>

      <div className="max-w-4xl">
        <BOMVersionForm skuId={skuId} skuName={skuName} />
      </div>
    </div>
  )
}
