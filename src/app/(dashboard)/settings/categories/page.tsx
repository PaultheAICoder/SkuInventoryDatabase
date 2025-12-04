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
import { CategoryTable } from '@/components/features/CategoryTable'
import { FolderTree, Search } from 'lucide-react'
import type { CategoryResponse } from '@/types/category'

export default function CategoriesPage() {
  const [categories, setCategories] = useState<CategoryResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<string>('')

  const fetchCategories = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (activeFilter) params.set('isActive', activeFilter)

      const res = await fetch(`/api/categories?${params.toString()}`)
      if (!res.ok) {
        throw new Error('Failed to load categories')
      }
      const data = await res.json().catch(() => ({}))
      setCategories(data?.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [search, activeFilter])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchCategories()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Category Management</h1>
          <p className="text-muted-foreground">Manage component categories</p>
        </div>
        <Button asChild>
          <Link href="/settings/categories/new">
            <FolderTree className="mr-2 h-4 w-4" />
            Add Category
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
              placeholder="Search categories..."
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
        <div className="py-10 text-center text-muted-foreground">Loading categories...</div>
      )}

      {/* Category Table */}
      {!isLoading && !error && (
        <CategoryTable categories={categories} onRefresh={fetchCategories} />
      )}
    </div>
  )
}
