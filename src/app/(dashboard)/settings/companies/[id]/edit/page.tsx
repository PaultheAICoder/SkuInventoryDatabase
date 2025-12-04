'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { CompanyForm } from '@/components/features/CompanyForm'
import type { CompanyResponse } from '@/types/company'

export default function EditCompanyPage() {
  const params = useParams()
  const id = params.id as string
  const [company, setCompany] = useState<CompanyResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchCompany() {
      try {
        const res = await fetch(`/api/companies/${id}`)
        if (!res.ok) {
          throw new Error('Company not found')
        }
        const data = await res.json().catch(() => ({}))
        setCompany(data?.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setIsLoading(false)
      }
    }

    fetchCompany()
  }, [id])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/settings/companies">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Companies
            </Button>
          </Link>
        </div>
        <div className="py-10 text-center text-muted-foreground">Loading company...</div>
      </div>
    )
  }

  if (error || !company) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/settings/companies">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Companies
            </Button>
          </Link>
        </div>
        <div className="rounded-md bg-destructive/10 p-4 text-destructive">
          {error || 'Company not found'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/settings/companies">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Companies
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Edit Company</h1>
      </div>

      <div className="max-w-2xl">
        <CompanyForm company={company} />
      </div>
    </div>
  )
}
