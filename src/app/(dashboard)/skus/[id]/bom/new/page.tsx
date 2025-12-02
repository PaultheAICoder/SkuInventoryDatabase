'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { BOMVersionForm } from '@/components/features/BOMVersionForm'

interface NewBOMPageProps {
  params: Promise<{ id: string }>
}

export default function NewBOMPage({ params }: NewBOMPageProps) {
  const router = useRouter()
  const [skuId, setSkuId] = useState<string | null>(null)
  const [skuName, setSkuName] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    params.then((p) => setSkuId(p.id))
  }, [params])

  useEffect(() => {
    if (!skuId) return

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

  if (error || !skuId) {
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
