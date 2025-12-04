'use client'

import { useSession } from 'next-auth/react'
import { useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Building2 } from 'lucide-react'
import { toast } from 'sonner'

export function CompanySelector() {
  const { data: session, update: updateSession } = useSession()
  const [isLoading, setIsLoading] = useState(false)

  // Don't render if user has 0-1 companies
  if (!session?.user?.companies || session.user.companies.length <= 1) {
    return null
  }

  const handleCompanyChange = async (companyId: string) => {
    // Skip if selecting the same company
    if (companyId === session.user.selectedCompanyId) return

    setIsLoading(true)
    try {
      const res = await fetch('/api/companies/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to switch company')
      }

      const data = await res.json()

      // Update session with new company info
      await updateSession({
        selectedCompanyId: data.data.selectedCompanyId,
        selectedCompanyName: data.data.selectedCompanyName,
      })

      toast.success('Company switched', {
        description: `Switched to ${data.data.selectedCompanyName}`,
      })

      // Note: Data refetching after company switch is handled by sub-issue 6
    } catch (error) {
      console.error('Error switching company:', error)
      toast.error('Failed to switch company', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="px-4 py-2 border-b">
      <Select
        value={session.user.selectedCompanyId}
        onValueChange={handleCompanyChange}
        disabled={isLoading}
      >
        <SelectTrigger className="w-full">
          <Building2 className="h-4 w-4 mr-2 shrink-0" />
          <SelectValue placeholder="Select company" />
        </SelectTrigger>
        <SelectContent>
          {session.user.companies.map((company) => (
            <SelectItem key={company.id} value={company.id}>
              {company.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
