'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ChangeLogFilters, type ChangeLogFiltersValue } from '@/components/features/ChangeLogFilters'
import { ChangeLogTable } from '@/components/features/ChangeLogTable'
import type { ChangeLogEntryWithRelations } from '@/types/recommendations'

function ChangeLogContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [entries, setEntries] = useState<ChangeLogEntryWithRelations[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const pageSize = parseInt(searchParams.get('pageSize') ?? '50', 10)
  const totalPages = Math.ceil(total / pageSize)

  const [filters, setFilters] = useState<ChangeLogFiltersValue>({
    action: searchParams.get('action') ?? '',
    type: searchParams.get('type') ?? '',
    keyword: searchParams.get('keyword') ?? '',
    startDate: searchParams.get('startDate') ?? '',
    endDate: searchParams.get('endDate') ?? '',
  })

  const updateFilters = (params: Record<string, string>) => {
    const newParams = new URLSearchParams(searchParams.toString())
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        newParams.set(key, value)
      } else {
        newParams.delete(key)
      }
    })
    if (!params.page) {
      newParams.set('page', '1')
    }
    router.push(`/change-log?${newParams.toString()}`)
  }

  const fetchEntries = useCallback(async () => {
    // Don't fetch if no brand selected
    if (!session?.user?.selectedBrandId) {
      setEntries([])
      setTotal(0)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      })
      if (filters.action) params.set('action', filters.action)
      if (filters.type) params.set('type', filters.type)
      if (filters.keyword) params.set('keyword', filters.keyword)
      if (filters.startDate) params.set('startDate', filters.startDate)
      if (filters.endDate) params.set('endDate', filters.endDate)

      const res = await fetch(`/api/change-log?${params.toString()}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || 'Failed to load change log')
      }
      const result = await res.json()
      setEntries(result.data)
      setTotal(result.meta.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [page, pageSize, filters, session?.user?.selectedBrandId])

  // Refetch when filters, page, or brand changes
  useEffect(() => {
    if (status === 'loading') return
    fetchEntries()
  }, [fetchEntries, status])

  const handleApplyFilters = () => {
    updateFilters({
      action: filters.action,
      type: filters.type,
      keyword: filters.keyword,
      startDate: filters.startDate,
      endDate: filters.endDate,
    })
  }

  const handleClearFilters = () => {
    setFilters({
      action: '',
      type: '',
      keyword: '',
      startDate: '',
      endDate: '',
    })
    router.push('/change-log')
  }

  // Show brand selection message if no brand is selected
  if (status !== 'loading' && !session?.user?.selectedBrandId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Change Log</h1>
          <p className="text-muted-foreground">
            Track all accepted, rejected, and snoozed recommendations
          </p>
        </div>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Please select a brand from the sidebar to view the change log.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Change Log</h1>
        <p className="text-muted-foreground">
          Track all accepted, rejected, and snoozed recommendations
        </p>
      </div>

      {/* Filters */}
      <ChangeLogFilters
        filters={filters}
        onFiltersChange={setFilters}
        onApply={handleApplyFilters}
        onClear={handleClearFilters}
      />

      {/* Error State */}
      {error && (
        <Card>
          <CardContent className="py-10 text-center text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* Loading State handled by table */}
      {!error && (
        <>
          <ChangeLogTable entries={entries} isLoading={status === 'loading' || isLoading} />

          {/* Pagination */}
          {!isLoading && totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total}{' '}
                entries
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateFilters({ page: (page - 1).toString() })}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateFilters({ page: (page + 1).toString() })}
                  disabled={page >= totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function ChangeLogPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ChangeLogContent />
    </Suspense>
  )
}
