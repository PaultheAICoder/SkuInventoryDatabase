'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Download, Loader2, BarChart3, Settings, Bell } from 'lucide-react'
import { toast } from 'sonner'
import { DefectAnalyticsFilters } from './DefectAnalyticsFilters'
import { DefectAnalyticsSummary } from './DefectAnalyticsSummary'
import { DefectTrendChart } from './DefectTrendChart'
import { DefectBOMComparisonChart } from './DefectBOMComparisonChart'
import { DefectAlertsList } from './DefectAlertsList'
import { DefectThresholdConfig } from './DefectThresholdConfig'
import type { DefectAnalyticsResponse } from '@/types/analytics'
import type { DefectAlertResponse } from '@/types/alert'

interface FilterOptions {
  skus: Array<{ id: string; name: string; internalCode: string }>
  bomVersions: Array<{ id: string; versionName: string; skuName: string }>
  salesChannels: string[]
}

interface FilterValues {
  dateFrom: string
  dateTo: string
  skuId: string
  bomVersionId: string
  salesChannel: string
  groupBy: 'day' | 'week' | 'month'
}

const defaultFilters: FilterValues = {
  dateFrom: '',
  dateTo: '',
  skuId: '',
  bomVersionId: '',
  salesChannel: '',
  groupBy: 'day',
}

interface DefectAnalyticsDashboardProps {
  userRole: string
}

export function DefectAnalyticsDashboard({ userRole }: DefectAnalyticsDashboardProps) {
  const [data, setData] = useState<DefectAnalyticsResponse | null>(null)
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    skus: [],
    bomVersions: [],
    salesChannels: [],
  })
  const [filters, setFilters] = useState<FilterValues>(defaultFilters)
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alerts, setAlerts] = useState<DefectAlertResponse[]>([])
  const [isAcknowledging, setIsAcknowledging] = useState(false)
  const [activeTab, setActiveTab] = useState('analytics')

  // Fetch alerts
  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/alerts/defects?acknowledged=false&limit=10')
      if (res.ok) {
        const result = await res.json()
        setAlerts(result.data.alerts || [])
      }
    } catch (err) {
      console.error('Error fetching alerts:', err)
    }
  }, [])

  // Handle acknowledge alert
  const handleAcknowledge = async (alertId: string) => {
    setIsAcknowledging(true)
    try {
      const res = await fetch(`/api/alerts/defects/${alertId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledge: true }),
      })

      if (!res.ok) throw new Error('Failed to acknowledge alert')

      toast.success('Alert acknowledged')
      fetchAlerts()
    } catch {
      toast.error('Failed to acknowledge alert')
    } finally {
      setIsAcknowledging(false)
    }
  }

  // Fetch filter options
  const fetchFilterOptions = useCallback(async (skuId?: string) => {
    try {
      const url = new URL('/api/analytics/defects', window.location.origin)
      url.searchParams.set('filters', 'true')
      if (skuId) {
        url.searchParams.set('skuId', skuId)
      }

      const res = await fetch(url.toString())
      if (!res.ok) throw new Error('Failed to load filter options')

      const result = await res.json()
      setFilterOptions(result.data)
    } catch (err) {
      console.error('Error fetching filter options:', err)
    }
  }, [])

  // Fetch analytics data
  const fetchAnalytics = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const url = new URL('/api/analytics/defects', window.location.origin)

      if (filters.dateFrom) url.searchParams.set('dateFrom', filters.dateFrom)
      if (filters.dateTo) url.searchParams.set('dateTo', filters.dateTo)
      if (filters.skuId) url.searchParams.set('skuId', filters.skuId)
      if (filters.bomVersionId) url.searchParams.set('bomVersionId', filters.bomVersionId)
      if (filters.salesChannel) url.searchParams.set('salesChannel', filters.salesChannel)
      url.searchParams.set('groupBy', filters.groupBy)

      const res = await fetch(url.toString())
      if (!res.ok) throw new Error('Failed to load analytics')

      const result = await res.json()
      setData(result.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [filters])

  // Initial load
  useEffect(() => {
    fetchFilterOptions()
    fetchAnalytics()
    fetchAlerts()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update BOM versions when SKU changes
  useEffect(() => {
    if (filters.skuId) {
      fetchFilterOptions(filters.skuId)
    }
  }, [filters.skuId, fetchFilterOptions])

  const handleFilterChange = (key: keyof FilterValues, value: string) => {
    setFilters((prev) => {
      const newFilters = { ...prev, [key]: value }
      // Clear BOM version if SKU changes
      if (key === 'skuId') {
        newFilters.bomVersionId = ''
      }
      return newFilters
    })
  }

  const handleApplyFilters = () => {
    fetchAnalytics()
  }

  const handleClearFilters = () => {
    setFilters(defaultFilters)
    fetchFilterOptions()
    // Fetch with default filters
    setTimeout(() => {
      fetchAnalytics()
    }, 0)
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const url = new URL('/api/analytics/defects', window.location.origin)
      url.searchParams.set('export', 'csv')

      if (filters.dateFrom) url.searchParams.set('dateFrom', filters.dateFrom)
      if (filters.dateTo) url.searchParams.set('dateTo', filters.dateTo)
      if (filters.skuId) url.searchParams.set('skuId', filters.skuId)
      if (filters.bomVersionId) url.searchParams.set('bomVersionId', filters.bomVersionId)
      if (filters.salesChannel) url.searchParams.set('salesChannel', filters.salesChannel)

      const res = await fetch(url.toString())
      if (!res.ok) throw new Error('Export failed')

      const blob = await res.blob()
      const contentDisposition = res.headers.get('Content-Disposition')
      let filename = 'defect-analytics.csv'
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/)
        if (match) filename = match[1]
      }

      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(downloadUrl)

      toast.success('Export complete', {
        description: 'Your defect analytics data has been downloaded.',
      })
    } catch (err) {
      console.error('Export error:', err)
      toast.error('Export failed', {
        description: 'Please try again.',
      })
    } finally {
      setIsExporting(false)
    }
  }

  const unacknowledgedCount = alerts.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Defect Analytics</h1>
          <p className="text-muted-foreground">
            Analyze defect rates and quality trends across builds
          </p>
        </div>
        <Button onClick={handleExport} disabled={isExporting || isLoading} variant="outline">
          {isExporting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </>
          )}
        </Button>
      </div>

      {/* Active Alerts Banner - Show at top when there are alerts */}
      {unacknowledgedCount > 0 && activeTab === 'analytics' && (
        <DefectAlertsList
          alerts={alerts}
          onAcknowledge={handleAcknowledge}
          isLoading={isAcknowledging}
        />
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="alerts" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Alerts
            {unacknowledgedCount > 0 && (
              <span className="ml-1 rounded-full bg-yellow-500 px-1.5 py-0.5 text-xs font-medium text-white">
                {unacknowledgedCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="thresholds" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Thresholds
          </TabsTrigger>
        </TabsList>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          {/* Filters */}
          <DefectAnalyticsFilters
            filters={filters}
            options={filterOptions}
            onFilterChange={handleFilterChange}
            onApply={handleApplyFilters}
            onClear={handleClearFilters}
            isLoading={isLoading}
          />

          {/* Loading State */}
          {isLoading && (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div className="flex h-64 items-center justify-center text-red-500">{error}</div>
          )}

          {/* Content */}
          {data && !isLoading && !error && (
            <>
              {/* Summary Stats */}
              <DefectAnalyticsSummary summary={data.summary} />

              {/* Charts Grid */}
              <div className="grid gap-6 lg:grid-cols-1">
                <DefectTrendChart data={data.trends} groupBy={data.filters.groupBy} />
              </div>

              <div className="grid gap-6 lg:grid-cols-1">
                <DefectBOMComparisonChart data={data.byBOMVersion} />
              </div>
            </>
          )}

          {/* No Data State */}
          {data && data.summary.totalBuilds === 0 && !isLoading && !error && (
            <div className="flex h-64 flex-col items-center justify-center text-muted-foreground">
              <p className="text-lg font-medium">No build transactions found</p>
              <p className="text-sm">
                Try adjusting your filters or record some build transactions with defect data
              </p>
            </div>
          )}
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="space-y-6">
          <DefectAlertsList
            alerts={alerts}
            onAcknowledge={handleAcknowledge}
            isLoading={isAcknowledging}
          />
        </TabsContent>

        {/* Thresholds Tab */}
        <TabsContent value="thresholds" className="space-y-6">
          <DefectThresholdConfig userRole={userRole} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
