'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CompanyTable } from '@/components/features/CompanyTable'
import { Building2, Search } from 'lucide-react'
import type { CompanyResponse } from '@/types/company'

export default function CompaniesPage() {
  const { data: session, status } = useSession()
  const [companies, setCompanies] = useState<CompanyResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const fetchCompanies = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)

      const res = await fetch(`/api/companies?${params.toString()}`)
      if (!res.ok) {
        throw new Error('Failed to load companies')
      }
      const data = await res.json().catch(() => ({}))
      setCompanies(data?.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [search])

  useEffect(() => {
    // Don't fetch while session is loading
    if (status === 'loading') return

    fetchCompanies()
  }, [fetchCompanies, status])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchCompanies()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Company Management</h1>
          <p className="text-muted-foreground">Manage companies in the system</p>
        </div>
        <Button asChild>
          <Link href="/settings/companies/new">
            <Building2 className="mr-2 h-4 w-4" />
            Add Company
          </Link>
        </Button>
      </div>

      {/* Search */}
      <div className="flex flex-wrap items-center gap-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search companies..."
              className="pl-8 w-[250px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-md bg-destructive/10 p-4 text-destructive">{error}</div>
      )}

      {/* Loading State */}
      {(status === 'loading' || isLoading) && (
        <div className="py-10 text-center text-muted-foreground">Loading companies...</div>
      )}

      {/* Company Table */}
      {!isLoading && status !== 'loading' && !error && session?.user && (
        <CompanyTable
          companies={companies}
          currentCompanyId={session.user.selectedCompanyId}
          onRefresh={fetchCompanies}
        />
      )}
    </div>
  )
}
