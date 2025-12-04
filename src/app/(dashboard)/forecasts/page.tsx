'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ForecastTable } from '@/components/features/ForecastTable'
import { getForecastStatus } from '@/components/features/ForecastStatusBadge'
import { AlertCircle, AlertTriangle, TrendingDown, Package } from 'lucide-react'
import type { ComponentForecastResponse } from '@/types/forecast'

interface ForecastListResponse {
  data: ComponentForecastResponse[]
  meta: {
    total: number
    page: number
    pageSize: number
    totalPages: number
  }
}

export default function ForecastsPage() {
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const [response, setResponse] = useState<ForecastListResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Build query params from searchParams
  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    const page = searchParams.get('page') || '1'
    const pageSize = searchParams.get('pageSize') || '50'
    const sortBy = searchParams.get('sortBy') || 'runoutDate'
    const sortOrder = searchParams.get('sortOrder') || 'asc'
    const showOnlyAtRisk = searchParams.get('showOnlyAtRisk')

    params.set('page', page)
    params.set('pageSize', pageSize)
    params.set('sortBy', sortBy)
    params.set('sortOrder', sortOrder)
    if (showOnlyAtRisk === 'true') {
      params.set('showOnlyAtRisk', 'true')
    }

    return params.toString()
  }, [searchParams])

  useEffect(() => {
    async function fetchForecasts() {
      try {
        setIsLoading(true)
        setError(null)
        const res = await fetch(`/api/forecasts?${queryString}`)
        if (!res.ok) {
          throw new Error('Failed to load forecasts')
        }
        const result = await res.json()
        setResponse(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setIsLoading(false)
      }
    }

    if (session?.user?.selectedCompanyId) {
      fetchForecasts()
    }
  }, [queryString, session?.user?.selectedCompanyId])

  // Compute stats from the response data
  const stats = useMemo(() => {
    if (!response?.data) {
      return { total: 0, critical: 0, warning: 0, noUsage: 0 }
    }

    const data = response.data
    let critical = 0
    let warning = 0
    let noUsage = 0

    for (const forecast of data) {
      const status = getForecastStatus(
        forecast.averageDailyConsumption,
        forecast.recommendedReorderDate
      )
      if (status === 'critical') critical++
      else if (status === 'warning') warning++
      else if (status === 'na') noUsage++
    }

    return {
      total: response.meta.total,
      critical,
      warning,
      noUsage,
    }
  }, [response])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Forecasts</h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (error || !response) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Forecasts</h1>
          <p className="text-red-500">{error || 'Failed to load data'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Forecasts</h1>
        <p className="text-muted-foreground">
          Component runout predictions and reorder recommendations
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Components</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Components with forecasts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
            <p className="text-xs text-muted-foreground">Reorder needed now</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Warning</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.warning}</div>
            <p className="text-xs text-muted-foreground">Reorder within 7 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">No Usage</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.noUsage}</div>
            <p className="text-xs text-muted-foreground">Zero consumption data</p>
          </CardContent>
        </Card>
      </div>

      {/* Forecast Table */}
      <ForecastTable
        forecasts={response.data}
        total={response.meta.total}
        page={response.meta.page}
        pageSize={response.meta.pageSize}
      />
    </div>
  )
}
