'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { UserForm } from '@/components/features/UserForm'
import { CompanyAssignment } from '@/components/features/CompanyAssignment'
import type { UserWithCompaniesResponse } from '@/types/user'

interface Company {
  id: string
  name: string
}

export default function EditUserPage() {
  const params = useParams()
  const id = params.id as string
  const [user, setUser] = useState<UserWithCompaniesResponse | null>(null)
  const [allCompanies, setAllCompanies] = useState<Company[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const [userRes, companiesRes] = await Promise.all([
          fetch(`/api/users/${id}`),
          fetch('/api/companies?pageSize=100'),
        ])

        if (!userRes.ok) {
          throw new Error('User not found')
        }
        if (!companiesRes.ok) {
          throw new Error('Failed to load companies')
        }

        const userData = await userRes.json()
        const companiesData = await companiesRes.json()

        setUser(userData?.data)
        setAllCompanies(
          companiesData?.data?.map((c: { id: string; name: string }) => ({
            id: c.id,
            name: c.name,
          })) ?? []
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [id])

  const handleCompanyAssignment = useCallback(
    async (companyIds: string[]) => {
      const res = await fetch(`/api/users/${id}/companies`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyIds }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to update company assignments')
      }

      const data = await res.json()
      // Update local state with new assignments
      setUser((prev) => (prev ? { ...prev, companies: data.data } : null))
    },
    [id]
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/settings/users">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Users
            </Button>
          </Link>
        </div>
        <div className="py-10 text-center text-muted-foreground">Loading user...</div>
      </div>
    )
  }

  if (error || !user) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/settings/users">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Users
            </Button>
          </Link>
        </div>
        <div className="rounded-md bg-destructive/10 p-4 text-destructive">
          {error || 'User not found'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings/users">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Users
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Edit User</h1>
      </div>

      <div className="max-w-2xl">
        <UserForm user={user} />
      </div>

      {user && (
        <div className="max-w-2xl">
          <CompanyAssignment
            userId={user.id}
            assignedCompanyIds={user.companies?.map((c) => c.companyId) ?? []}
            allCompanies={allCompanies}
            onAssignmentChange={handleCompanyAssignment}
          />
        </div>
      )}
    </div>
  )
}
