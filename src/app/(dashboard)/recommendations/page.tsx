'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RecommendationList } from '@/components/features/RecommendationList'
import {
  Lightbulb,
  CheckCircle,
  XCircle,
  PauseCircle,
  Clock,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import type {
  RecommendationWithRelations,
  RecommendationSummary,
  RecommendationStatus,
  RecommendationType,
  ConfidenceLevel,
} from '@/types/recommendations'

interface RecommendationListResponse {
  data: RecommendationWithRelations[]
  meta: {
    total: number
    page: number
    pageSize: number
    totalPages: number
  }
}

export default function RecommendationsPage() {
  const { data: session, status } = useSession()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [recommendations, setRecommendations] = useState<RecommendationWithRelations[]>([])
  const [stats, setStats] = useState<RecommendationSummary | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get filter values from URL
  const statusFilter = searchParams.get('status') as RecommendationStatus | null
  const typeFilter = searchParams.get('type') as RecommendationType | null
  const confidenceFilter = searchParams.get('confidence') as ConfidenceLevel | null
  const page = parseInt(searchParams.get('page') || '1', 10)

  // Fetch recommendations
  const fetchRecommendations = useCallback(async () => {
    if (!session?.user?.selectedBrandId) return

    try {
      setIsLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (typeFilter) params.set('type', typeFilter)
      if (confidenceFilter) params.set('confidence', confidenceFilter)
      params.set('page', page.toString())
      params.set('pageSize', '20')

      const res = await fetch(`/api/recommendations?${params.toString()}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || 'Failed to load recommendations')
      }

      const result: RecommendationListResponse = await res.json()
      setRecommendations(result.data)
      setTotalCount(result.meta.total)

      // Calculate stats from current data for quick display
      // In a real app, we might want a separate summary endpoint
      const pendingCount = result.data.filter((r) => r.status === 'PENDING').length
      const acceptedCount = result.data.filter((r) => r.status === 'ACCEPTED').length
      const rejectedCount = result.data.filter((r) => r.status === 'REJECTED').length
      const snoozedCount = result.data.filter((r) => r.status === 'SNOOZED').length

      setStats({
        total: result.meta.total,
        pending: pendingCount,
        accepted: acceptedCount,
        rejected: rejectedCount,
        snoozed: snoozedCount,
        byType: {} as Record<RecommendationType, number>,
        byConfidence: {} as Record<ConfidenceLevel, number>,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [session?.user?.selectedBrandId, statusFilter, typeFilter, confidenceFilter, page])

  // Handle action on recommendation
  const handleAction = async (
    id: string,
    action: 'accept' | 'reject' | 'snooze',
    data?: { notes?: string; reason?: string; snoozeDays?: number }
  ) => {
    setIsProcessing(true)
    try {
      const body: Record<string, unknown> = {
        action: action.toUpperCase(),
      }

      if (action === 'accept' && data?.notes) {
        body.notes = data.notes
      }
      if (action === 'reject' && data?.reason) {
        body.reason = data.reason
      }
      if (action === 'snooze' && data?.snoozeDays) {
        body.snoozeDays = data.snoozeDays
      }

      const res = await fetch(`/api/recommendations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || 'Failed to update recommendation')
      }

      // Optimistic update - remove from list or update status
      setRecommendations((prev) =>
        prev.map((rec) =>
          rec.id === id
            ? {
                ...rec,
                status: action.toUpperCase() as RecommendationStatus,
              }
            : rec
        )
      )

      // Refresh to get accurate counts
      await fetchRecommendations()
    } catch (err) {
      console.error('Error actioning recommendation:', err)
      throw err
    } finally {
      setIsProcessing(false)
    }
  }

  // Generate recommendations
  const handleGenerate = async () => {
    setIsGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || 'Failed to generate recommendations')
      }

      const result = await res.json()
      if (result.data.generated > 0) {
        // Refresh the list
        await fetchRecommendations()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate recommendations')
    } finally {
      setIsGenerating(false)
    }
  }

  // Update URL with filters
  const updateFilter = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.set('page', '1') // Reset to page 1
    router.push(`/recommendations?${params.toString()}`)
  }

  // Effect for initial load
  useEffect(() => {
    if (status === 'loading') return
    if (session?.user?.selectedBrandId) {
      fetchRecommendations()
    } else {
      setIsLoading(false)
    }
  }, [status, session?.user?.selectedBrandId, fetchRecommendations])

  if (status === 'loading') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Recommendations</h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!session?.user?.selectedBrandId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Recommendations</h1>
          <p className="text-muted-foreground">
            Monday Dashboard for weekly recommendation review
          </p>
        </div>
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Brand Selected</h3>
              <p className="text-muted-foreground">
                Please select a brand from the sidebar to view recommendations.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Recommendations</h1>
          <p className="text-muted-foreground">
            Monday Dashboard for weekly recommendation review
          </p>
        </div>
        <Button onClick={handleGenerate} disabled={isGenerating || isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isGenerating ? 'animate-spin' : ''}`} />
          {isGenerating ? 'Generating...' : 'Generate Recommendations'}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Lightbulb className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCount}</div>
            <p className="text-xs text-muted-foreground">All recommendations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats?.pending ?? 0}</div>
            <p className="text-xs text-muted-foreground">Awaiting review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Accepted</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.accepted ?? 0}</div>
            <p className="text-xs text-muted-foreground">Implemented</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rejected</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats?.rejected ?? 0}</div>
            <p className="text-xs text-muted-foreground">Not implemented</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Snoozed</CardTitle>
            <PauseCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats?.snoozed ?? 0}</div>
            <p className="text-xs text-muted-foreground">Deferred</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Status:</span>
          <Select
            value={statusFilter || 'all'}
            onValueChange={(value) => updateFilter('status', value === 'all' ? null : value)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="ACCEPTED">Accepted</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
              <SelectItem value="SNOOZED">Snoozed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Type:</span>
          <Select
            value={typeFilter || 'all'}
            onValueChange={(value) => updateFilter('type', value === 'all' ? null : value)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="KEYWORD_GRADUATION">Keyword Graduation</SelectItem>
              <SelectItem value="NEGATIVE_KEYWORD">Negative Keyword</SelectItem>
              <SelectItem value="DUPLICATE_KEYWORD">Duplicate Keyword</SelectItem>
              <SelectItem value="BUDGET_INCREASE">Budget Increase</SelectItem>
              <SelectItem value="BID_DECREASE">Bid Decrease</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Confidence:</span>
          <Select
            value={confidenceFilter || 'all'}
            onValueChange={(value) => updateFilter('confidence', value === 'all' ? null : value)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="LOW">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recommendation List */}
      <RecommendationList
        recommendations={recommendations}
        onAction={handleAction}
        isLoading={isLoading}
        isProcessing={isProcessing}
      />

      {/* Pagination */}
      {totalCount > 20 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => updateFilter('page', String(page - 1))}
            disabled={page <= 1}
          >
            Previous
          </Button>
          <span className="flex items-center px-4 text-sm text-muted-foreground">
            Page {page} of {Math.ceil(totalCount / 20)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => updateFilter('page', String(page + 1))}
            disabled={page >= Math.ceil(totalCount / 20)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
