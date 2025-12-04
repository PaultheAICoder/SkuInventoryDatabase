'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { CategoryForm } from '@/components/features/CategoryForm'
import type { CategoryResponse } from '@/types/category'

export default function EditCategoryPage() {
  const params = useParams()
  const id = params.id as string
  const [category, setCategory] = useState<CategoryResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchCategory() {
      try {
        const res = await fetch(`/api/categories/${id}`)
        if (!res.ok) {
          throw new Error('Category not found')
        }
        const data = await res.json().catch(() => ({}))
        setCategory(data?.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setIsLoading(false)
      }
    }

    fetchCategory()
  }, [id])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/settings/categories">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Categories
            </Button>
          </Link>
        </div>
        <div className="py-10 text-center text-muted-foreground">Loading category...</div>
      </div>
    )
  }

  if (error || !category) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/settings/categories">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Categories
            </Button>
          </Link>
        </div>
        <div className="rounded-md bg-destructive/10 p-4 text-destructive">
          {error || 'Category not found'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings/categories">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Categories
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Edit Category</h1>
      </div>

      <div className="max-w-2xl">
        <CategoryForm category={category} />
      </div>
    </div>
  )
}
