'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { BOMVersionEditForm } from '@/components/features/BOMVersionEditForm'
import type { BOMVersionResponse } from '@/types/bom'

export default function EditBOMPage() {
  const router = useRouter()
  const params = useParams()
  const skuId = params.id as string
  const bomId = params.bomId as string
  const [skuName, setSkuName] = useState<string>('')
  const [bomVersion, setBomVersion] = useState<BOMVersionResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const [skuRes, bomRes] = await Promise.all([
          fetch(`/api/skus/${skuId}`),
          fetch(`/api/bom-versions/${bomId}`),
        ])

        if (!skuRes.ok) {
          throw new Error('SKU not found')
        }
        if (!bomRes.ok) {
          throw new Error('BOM version not found')
        }

        const skuData = await skuRes.json().catch(() => ({}))
        const bomData = await bomRes.json().catch(() => ({}))

        setSkuName(skuData?.data?.name || '')
        setBomVersion(bomData?.data || null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [skuId, bomId])

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

  if (error || !bomVersion) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>
        <p className="text-red-500">{error || 'BOM version not found'}</p>
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
          <h1 className="text-3xl font-bold tracking-tight">Edit BOM Version</h1>
          <p className="text-muted-foreground">
            Editing {bomVersion.versionName} for {skuName}
          </p>
        </div>
      </div>

      <div className="max-w-4xl">
        <BOMVersionEditForm
          bomVersionId={bomId}
          skuId={skuId}
          skuName={skuName}
          initialData={bomVersion}
        />
      </div>
    </div>
  )
}
