'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { BrandForm } from '@/components/features/BrandForm'
import type { BrandResponse } from '@/types/brand'

export default function EditBrandPage() {
  const params = useParams()
  const id = params.id as string
  const [brand, setBrand] = useState<BrandResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchBrand() {
      try {
        const res = await fetch(`/api/brands/${id}`)
        if (!res.ok) {
          throw new Error('Brand not found')
        }
        const data = await res.json().catch(() => ({}))
        setBrand(data?.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setIsLoading(false)
      }
    }

    fetchBrand()
  }, [id])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/settings/brands">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Brands
            </Button>
          </Link>
        </div>
        <div className="py-10 text-center text-muted-foreground">Loading brand...</div>
      </div>
    )
  }

  if (error || !brand) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/settings/brands">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Brands
            </Button>
          </Link>
        </div>
        <div className="rounded-md bg-destructive/10 p-4 text-destructive">
          {error || 'Brand not found'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings/brands">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Brands
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Edit Brand</h1>
      </div>

      <div className="max-w-2xl">
        <BrandForm brand={brand} />
      </div>
    </div>
  )
}
