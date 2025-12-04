'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import type { CompanyResponse } from '@/types/company'

interface BrandOption {
  id: string
  name: string
  isActive: boolean
  companyId: string
  companyName?: string
  componentCount: number
  skuCount: number
}

interface CompanyFormProps {
  company?: CompanyResponse
  allBrands?: BrandOption[]
  onSuccess?: () => void
}

export function CompanyForm({ company, allBrands = [], onSuccess }: CompanyFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get initial selected brand IDs from company's brands
  const initialBrandIds = company?.brands?.map((b) => b.id) || []

  const [formData, setFormData] = useState({
    name: company?.name ?? '',
    selectedBrandIds: initialBrandIds,
  })

  const isEditing = !!company

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const url = isEditing ? `/api/companies/${company.id}` : '/api/companies'
      const method = isEditing ? 'PATCH' : 'POST'

      const body: Record<string, unknown> = {
        name: formData.name,
      }

      if (isEditing) {
        body.brandIds = formData.selectedBrandIds
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

  const handleBrandToggle = (brandId: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      selectedBrandIds: checked
        ? [...prev.selectedBrandIds, brandId]
        : prev.selectedBrandIds.filter((id) => id !== brandId),
    }))
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

          {isEditing && allBrands.length > 0 && (
            <div className="space-y-3">
              <Label>Brand Associations</Label>
              <p className="text-xs text-muted-foreground">
                Select which brands belong to this company. Brands with components or SKUs cannot be removed.
              </p>
              <ScrollArea className="h-[200px] rounded-md border p-3">
                <div className="space-y-2">
                  {allBrands.map((brand) => {
                    const isChecked = formData.selectedBrandIds.includes(brand.id)
                    const belongsToThisCompany = brand.companyId === company.id
                    const hasData = brand.componentCount > 0 || brand.skuCount > 0
                    const isDisabled = belongsToThisCompany && hasData && isChecked

                    return (
                      <div
                        key={brand.id}
                        className="flex items-center justify-between py-1"
                      >
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id={`brand-${brand.id}`}
                            checked={isChecked}
                            onCheckedChange={(checked) => handleBrandToggle(brand.id, !!checked)}
                            disabled={isDisabled}
                          />
                          <Label
                            htmlFor={`brand-${brand.id}`}
                            className={`font-normal ${isDisabled ? 'text-muted-foreground' : ''}`}
                          >
                            {brand.name}
                            {!brand.isActive && (
                              <Badge variant="secondary" className="ml-2 text-xs">
                                Inactive
                              </Badge>
                            )}
                          </Label>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {!belongsToThisCompany && brand.companyName && (
                            <Badge variant="outline" className="text-xs">
                              {brand.companyName}
                            </Badge>
                          )}
                          {hasData && (
                            <span>
                              {brand.componentCount} comp, {brand.skuCount} SKUs
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
              {formData.selectedBrandIds.length === 0 && (
                <p className="text-xs text-amber-600">
                  Warning: Company has no brands selected
                </p>
              )}
            </div>
          )}

          {isEditing && allBrands.length === 0 && (
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
