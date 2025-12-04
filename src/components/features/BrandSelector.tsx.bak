'use client'

import { useSession } from 'next-auth/react'
import { useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tag } from 'lucide-react'
import { toast } from 'sonner'

export function BrandSelector() {
  const { data: session, update: updateSession } = useSession()
  const [isLoading, setIsLoading] = useState(false)

  // Don't render if user has no brands or only one brand
  if (!session?.user?.brands || session.user.brands.length <= 1) {
    return null
  }

  const handleBrandChange = async (brandId: string) => {
    // Skip if selecting the same brand
    if (brandId === session.user.selectedBrandId) return

    // Handle "all" option
    const actualBrandId = brandId === 'all' ? null : brandId

    setIsLoading(true)
    try {
      const res = await fetch('/api/brands/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId: actualBrandId }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to switch brand')
      }

      const data = await res.json()

      // Update session with new brand info
      await updateSession({
        selectedBrandId: data.data.selectedBrandId,
        selectedBrandName: data.data.selectedBrandName,
      })

      toast.success('Brand switched', {
        description: data.data.selectedBrandName
          ? `Switched to ${data.data.selectedBrandName}`
          : 'Showing all brands',
      })
    } catch (error) {
      console.error('Error switching brand:', error)
      toast.error('Failed to switch brand', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="px-4 py-2 border-b">
      <Select
        value={session.user.selectedBrandId ?? 'all'}
        onValueChange={handleBrandChange}
        disabled={isLoading}
      >
        <SelectTrigger className="w-full">
          <Tag className="h-4 w-4 mr-2 shrink-0" />
          <SelectValue placeholder="Select brand" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Brands</SelectItem>
          {session.user.brands.map((brand) => (
            <SelectItem key={brand.id} value={brand.id}>
              {brand.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
