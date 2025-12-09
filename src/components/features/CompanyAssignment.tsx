'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface Company {
  id: string
  name: string
}

interface CompanyAssignmentProps {
  userId: string
  assignedCompanyIds: string[]
  allCompanies: Company[]
  onAssignmentChange: (companyIds: string[]) => Promise<void>
  disabled?: boolean
}

export function CompanyAssignment({
  assignedCompanyIds,
  allCompanies,
  onAssignmentChange,
  disabled,
}: CompanyAssignmentProps) {
  const { update: updateSession } = useSession()
  const [isUpdating, setIsUpdating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleToggle = async (companyId: string, checked: boolean) => {
    const newIds = checked
      ? [...assignedCompanyIds, companyId]
      : assignedCompanyIds.filter((id) => id !== companyId)

    // Prevent removing all companies
    if (newIds.length === 0) {
      setError('User must be assigned to at least one company')
      return
    }

    setError(null)
    setIsUpdating(companyId)
    try {
      await onAssignmentChange(newIds)

      // Refresh the current user's session if they modified their own companies
      try {
        const refreshRes = await fetch('/api/session/refresh', { method: 'POST' })
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json()
          await updateSession({
            companies: refreshData.data.companies,
            companiesWithBrands: refreshData.data.companiesWithBrands,
          })
        }
      } catch (refreshError) {
        // Silent fail - user may need to re-login for changes to take effect
        console.warn('Failed to refresh session:', refreshError)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update assignment')
    } finally {
      setIsUpdating(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Company Assignments</CardTitle>
        <CardDescription>
          Select which companies this user can access. At least one company is required.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {allCompanies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No companies available.</p>
        ) : (
          allCompanies.map((company) => {
            const isAssigned = assignedCompanyIds.includes(company.id)
            const isLastAssigned = isAssigned && assignedCompanyIds.length === 1
            const isCurrentlyUpdating = isUpdating === company.id

            return (
              <div key={company.id} className="flex items-center space-x-3">
                <Checkbox
                  id={`company-${company.id}`}
                  checked={isAssigned}
                  onCheckedChange={(checked) => handleToggle(company.id, !!checked)}
                  disabled={disabled || isLastAssigned || isUpdating !== null}
                />
                <Label
                  htmlFor={`company-${company.id}`}
                  className={isCurrentlyUpdating ? 'text-muted-foreground' : ''}
                >
                  {company.name}
                  {isLastAssigned && (
                    <span className="ml-2 text-xs text-muted-foreground">(primary)</span>
                  )}
                  {isCurrentlyUpdating && (
                    <span className="ml-2 text-xs text-muted-foreground">Saving...</span>
                  )}
                </Label>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
