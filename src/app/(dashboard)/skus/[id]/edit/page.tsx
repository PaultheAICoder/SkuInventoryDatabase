'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { SKUForm } from '@/components/features/SKUForm'
import type { SKUResponse } from '@/types/sku'

export default function EditSKUPage() {
  const params = useParams()
  const id = params.id as string
  const [sku, setSku] = useState<SKUResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchSKU() {
      try {
        const res = await fetch(`/api/skus/${id}`)
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error('SKU not found')
          }
          throw new Error('Failed to load SKU')
        }
        const { data } = await res.json()
        setSku(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setIsLoading(false)
      }
    }

    fetchSKU()
  }, [id])

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-96 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (error || !sku) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Link href="/skus">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to SKUs
          </Button>
        </Link>
        <div className="rounded-md bg-destructive/10 p-6 text-center text-destructive">
          {error || 'SKU not found'}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href={`/skus/${id}`}>
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to SKU
        </Button>
      </Link>
      <div>
        <h1 className="text-3xl font-bold">Edit SKU</h1>
        <p className="text-muted-foreground">Update {sku.name}</p>
      </div>
      <SKUForm sku={sku} />
    </div>
  )
}
