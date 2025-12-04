'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { CategoryResponse } from '@/types/category'

interface CategoryFormProps {
  category?: CategoryResponse
  onSuccess?: () => void
}

export function CategoryForm({ category, onSuccess }: CategoryFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: category?.name ?? '',
    isActive: category?.isActive ?? true,
  })

  const isEditing = !!category

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const url = isEditing ? `/api/categories/${category.id}` : '/api/categories'
      const method = isEditing ? 'PATCH' : 'POST'

      // Build request body
      const body: Record<string, unknown> = {
        name: formData.name,
      }

      if (isEditing) {
        body.isActive = formData.isActive
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to save category')
      }

      if (onSuccess) {
        onSuccess()
      } else {
        router.push('/settings/categories')
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? 'Edit Category' : 'Create Category'}</CardTitle>
          <CardDescription>
            {isEditing
              ? 'Update category information'
              : 'Add a new category for your components'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              placeholder="Category Name"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              required
              maxLength={50}
            />
          </div>

          {isEditing && (
            <div className="flex items-center space-x-2">
              <input
                id="isActive"
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={formData.isActive}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, isActive: e.target.checked }))
                }
              />
              <Label htmlFor="isActive" className="font-normal">
                Active (inactive categories cannot be used for new items)
              </Label>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Category'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
