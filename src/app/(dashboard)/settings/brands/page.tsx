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
import { BrandTable } from '@/components/features/BrandTable'
import { Tag, Search } from 'lucide-react'
import type { BrandResponse } from '@/types/brand'

export default function BrandsPage() {
  const [brands, setBrands] = useState<BrandResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<string>('')

  const fetchBrands = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (activeFilter) params.set('isActive', activeFilter)

      const res = await fetch(`/api/brands?${params.toString()}`)
      if (!res.ok) {
        throw new Error('Failed to load brands')
      }
      const data = await res.json().catch(() => ({}))
      setBrands(data?.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [search, activeFilter])

  useEffect(() => {
    fetchBrands()
  }, [fetchBrands])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchBrands()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Brand Management</h1>
          <p className="text-muted-foreground">Manage product brands</p>
        </div>
        <Button asChild>
          <Link href="/settings/brands/new">
            <Tag className="mr-2 h-4 w-4" />
            Add Brand
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
              placeholder="Search brands..."
              className="pl-8 w-[250px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>

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
        <div className="py-10 text-center text-muted-foreground">Loading brands...</div>
      )}

      {/* Brand Table */}
      {!isLoading && !error && (
        <BrandTable brands={brands} onRefresh={fetchBrands} />
      )}
    </div>
  )
}
