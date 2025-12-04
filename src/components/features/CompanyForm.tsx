'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { CompanyResponse } from '@/types/company'

interface CompanyFormProps {
  company?: CompanyResponse
  onSuccess?: () => void
}

export function CompanyForm({ company, onSuccess }: CompanyFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: company?.name ?? '',
  })

  const isEditing = !!company

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const url = isEditing ? `/api/companies/${company.id}` : '/api/companies'
      const method = isEditing ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formData.name }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to save company')
      }

      if (onSuccess) {
        onSuccess()
      } else {
        router.push('/settings/companies')
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
          <CardTitle>{isEditing ? 'Edit Company' : 'Create Company'}</CardTitle>
          <CardDescription>
            {isEditing
              ? 'Update company information'
              : 'Add a new company to the system'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Company Name *</Label>
            <Input
              id="name"
              placeholder="Acme Corporation"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              required
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground">
              Must be unique across all companies
            </p>
          </div>

          {isEditing && (
            <div className="text-sm text-muted-foreground">
              <p>Users: {company.userCount}</p>
              <p>Brands: {company.brandCount}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Company'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
