'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { VendorForm } from '@/components/features/VendorForm'
import type { VendorResponse } from '@/types/vendor'

export default function EditVendorPage() {
  const params = useParams()
  const id = params.id as string
  const [vendor, setVendor] = useState<VendorResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchVendor() {
      try {
        const res = await fetch(`/api/vendors/${id}`)
        if (!res.ok) {
          throw new Error('Vendor not found')
        }
        const data = await res.json().catch(() => ({}))
        setVendor(data?.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setIsLoading(false)
      }
    }

    fetchVendor()
  }, [id])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/settings/vendors">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Vendors
            </Button>
          </Link>
        </div>
        <div className="py-10 text-center text-muted-foreground">Loading vendor...</div>
      </div>
    )
  }

  if (error || !vendor) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/settings/vendors">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Vendors
            </Button>
          </Link>
        </div>
        <div className="rounded-md bg-destructive/10 p-4 text-destructive">
          {error || 'Vendor not found'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings/vendors">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Vendors
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Edit Vendor</h1>
      </div>

      <div className="max-w-2xl">
        <VendorForm vendor={vendor} />
      </div>
    </div>
  )
}
