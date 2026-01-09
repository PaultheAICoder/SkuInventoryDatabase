'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DollarSign, TrendingUp, TrendingDown, PieChart } from 'lucide-react'
import { subDays, format } from 'date-fns'
import {
  SalesTrendChart,
  AcosRoasChart,
  OrganicVsAdChart,
  KeywordPerformanceChart,
  DateRangeSelector,
  KeywordMetricsTable,
  CampaignTable,
  DailySalesTable,
} from '@/components/analytics'
import type {
  DateRangePreset,
  SalesTrendDataPoint,
  AcosRoasDataPoint,
  OrganicAdBreakdown,
  KeywordPerformanceData,
  AmazonAnalyticsSummary,
  KeywordMetricsResponse,
  CampaignPerformanceData,
  DailySalesTableData,
} from '@/types/amazon-analytics'
import type { DailyAttribution, AttributionResponse } from '@/types/attribution'

interface Brand {
  id: string
  name: string
}

interface SalesDailyApiResponse {
  attribution?: AttributionResponse
  brands?: Brand[]
  summary?: {
    totalSales: number
    adAttributedSales: number
    organicSales: number
    organicPercentage: number
    totalOrders: number
    dateRange: {
      startDate: string
      endDate: string
    }
  }
  daily?: Array<{
    date: string
    totalSales: number
    adAttributedSales: number
    organicSales: number
    organicPercentage: number
    orderCount: number
    channels: string[]
  }>
}

// Calculate date range from preset
function getDateRange(preset: DateRangePreset, customStart?: string, customEnd?: string) {
  const now = new Date()

  if (preset === 'custom' && customStart && customEnd) {
    return {
      startDate: customStart,
      endDate: customEnd,
    }
  }

  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90
  return {
    startDate: format(subDays(now, days), 'yyyy-MM-dd'),
    endDate: format(now, 'yyyy-MM-dd'),
  }
}

// Format currency for display
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

// Summary stat card component
function StatCard({
  title,
  value,
  subValue,
  icon: Icon,
  trend,
}: {
  title: string
  value: string
  subValue?: string
  icon: React.ElementType
  trend?: 'up' | 'down' | 'neutral'
}) {
  const trendColor =
    trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-muted-foreground'

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${trendColor}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subValue && <p className="text-xs text-muted-foreground">{subValue}</p>}
      </CardContent>
    </Card>
  )
}

export default function AmazonPage() {
  // State
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>('30d')
  const [customStartDate, setCustomStartDate] = useState<string>()
  const [customEndDate, setCustomEndDate] = useState<string>()
  const [selectedBrandId, setSelectedBrandId] = useState<string>('')
  const [brands, setBrands] = useState<Brand[]>([])

  // Data states
  const [summary, setSummary] = useState<AmazonAnalyticsSummary | null>(null)
  const [salesTrendData, setSalesTrendData] = useState<SalesTrendDataPoint[]>([])
  const [acosRoasData, setAcosRoasData] = useState<AcosRoasDataPoint[]>([])
  const [organicAdBreakdown, setOrganicAdBreakdown] = useState<OrganicAdBreakdown>({
    organic: 0,
    adAttributed: 0,
    organicPercentage: 0,
    adPercentage: 0,
  })
  const [keywordData, setKeywordData] = useState<KeywordPerformanceData[]>([])

  // Table-specific data states
  const [fullKeywordData, setFullKeywordData] = useState<KeywordPerformanceData[]>([])
  const [campaignData, setCampaignData] = useState<CampaignPerformanceData[]>([])
  const [dailySalesTableData, setDailySalesTableData] = useState<DailySalesTableData[]>([])

  // Loading states
  const [isLoadingSales, setIsLoadingSales] = useState(true)
  const [isLoadingKeywords, setIsLoadingKeywords] = useState(true)
  const [isLoadingFullKeywords, setIsLoadingFullKeywords] = useState(true)
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(true)

  // Error states
  const [salesError, setSalesError] = useState<string | null>(null)
  const [keywordsError, setKeywordsError] = useState<string | null>(null)

  // Watched keywords state
  const [watchedKeywords, setWatchedKeywords] = useState<Set<string>>(new Set())
  const [isWatchLoading, setIsWatchLoading] = useState(false)

  // Fetch sales data with attribution breakdown
  const fetchSalesData = useCallback(async () => {
    setIsLoadingSales(true)
    setSalesError(null)

    try {
      const { startDate, endDate } = getDateRange(dateRangePreset, customStartDate, customEndDate)

      // Build URL with parameters
      const url = new URL('/api/sales-daily', window.location.origin)
      url.searchParams.set('startDate', startDate)
      url.searchParams.set('endDate', endDate)
      url.searchParams.set('breakdown', 'attribution')
      if (selectedBrandId) {
        url.searchParams.set('brandId', selectedBrandId)
      }

      const res = await fetch(url.toString())
      if (!res.ok) {
        throw new Error('Failed to fetch sales data')
      }

      const data = (await res.json()) as SalesDailyApiResponse

      // Store brands for selector
      if (data.brands && data.brands.length > 0) {
        setBrands(data.brands)
        // Auto-select first brand if none selected
        if (!selectedBrandId && data.brands.length > 0) {
          setSelectedBrandId(data.brands[0].id)
        }
      }

      // Process attribution data if available
      if (data.attribution) {
        const attr = data.attribution

        // Set summary
        setSummary({
          totalSales: attr.summary.totalSales,
          organicSales: attr.summary.organicSales,
          adAttributedSales: attr.summary.adAttributedSales,
          organicPercentage: attr.summary.organicPercentage,
          totalSpend: 0, // Will be populated from keyword data
          overallAcos: 0,
          overallTacos: 0, // Will be calculated from keyword data
          overallRoas: 0,
        })

        // Set sales trend data
        const trendData: SalesTrendDataPoint[] = attr.daily.map((d: DailyAttribution) => ({
          date: d.date,
          totalSales: d.totalSales,
          adAttributedSales: d.adAttributedSales,
          organicSales: d.organicSales,
        }))
        setSalesTrendData(trendData)

        // Set daily sales table data
        const tableData: DailySalesTableData[] = attr.daily.map((d: DailyAttribution) => ({
          date: d.date,
          totalSales: d.totalSales,
          adAttributedSales: d.adAttributedSales,
          organicSales: d.organicSales,
          organicPercentage: d.totalSales > 0
            ? (d.organicSales / d.totalSales) * 100
            : 0,
          orderCount: d.orderCount ?? 0,
        }))
        setDailySalesTableData(tableData)

        // Set organic/ad breakdown
        setOrganicAdBreakdown({
          organic: attr.summary.organicSales,
          adAttributed: attr.summary.adAttributedSales,
          organicPercentage: attr.summary.organicPercentage,
          adPercentage: attr.summary.adPercentage,
        })
      } else if (data.daily && data.summary) {
        // Fallback to non-attribution data
        setSummary({
          totalSales: data.summary.totalSales,
          organicSales: data.summary.organicSales,
          adAttributedSales: data.summary.adAttributedSales,
          organicPercentage: data.summary.organicPercentage,
          totalSpend: 0,
          overallAcos: 0,
          overallTacos: 0, // Will be calculated from keyword data
          overallRoas: 0,
        })

        const trendData: SalesTrendDataPoint[] = data.daily.map((d) => ({
          date: d.date,
          totalSales: d.totalSales,
          adAttributedSales: d.adAttributedSales,
          organicSales: d.organicSales,
        }))
        setSalesTrendData(trendData)

        // Set daily sales table data
        const tableData: DailySalesTableData[] = data.daily.map((d) => ({
          date: d.date,
          totalSales: d.totalSales,
          adAttributedSales: d.adAttributedSales,
          organicSales: d.organicSales,
          organicPercentage: d.organicPercentage,
          orderCount: d.orderCount,
        }))
        setDailySalesTableData(tableData)

        const organicPct = data.summary.organicPercentage
        setOrganicAdBreakdown({
          organic: data.summary.organicSales,
          adAttributed: data.summary.adAttributedSales,
          organicPercentage: organicPct,
          adPercentage: 100 - organicPct,
        })
      }
    } catch (err) {
      setSalesError(err instanceof Error ? err.message : 'Failed to fetch sales data')
    } finally {
      setIsLoadingSales(false)
    }
  }, [dateRangePreset, customStartDate, customEndDate, selectedBrandId])

  // Fetch keyword metrics data
  const fetchKeywordData = useCallback(async () => {
    setIsLoadingKeywords(true)
    setKeywordsError(null)

    try {
      const { startDate, endDate } = getDateRange(dateRangePreset, customStartDate, customEndDate)

      const url = new URL('/api/analytics/amazon', window.location.origin)
      url.searchParams.set('startDate', startDate)
      url.searchParams.set('endDate', endDate)
      url.searchParams.set('limit', '10')
      if (selectedBrandId) {
        url.searchParams.set('brandId', selectedBrandId)
      }

      const res = await fetch(url.toString())
      if (!res.ok) {
        throw new Error('Failed to fetch keyword data')
      }

      const data = (await res.json()) as KeywordMetricsResponse

      setKeywordData(data.keywords)

      // Update summary with keyword totals (ACOS/TACOS/ROAS)
      setSummary((prev) => {
        if (!prev) return prev
        // Calculate TACOS: Ad Spend / Total Sales * 100
        const overallTacos = prev.totalSales > 0
          ? (data.totals.totalSpend / prev.totalSales) * 100
          : 0
        return {
          ...prev,
          totalSpend: data.totals.totalSpend,
          overallAcos: data.totals.overallAcos,
          overallTacos: Math.round(overallTacos * 100) / 100,
          overallRoas: data.totals.overallRoas,
        }
      })

      // Build ACOS/ROAS/TACOS trend data from keywords aggregated by date
      // Note: For now, we use the keyword totals; a more granular approach would need daily keyword data
      // We'll create a simple trend based on the date range
      const dailySpend = data.totals.totalSpend / salesTrendData.length
      const acosRoasTrend: AcosRoasDataPoint[] = salesTrendData.map((d) => ({
        date: d.date,
        acos: data.totals.overallAcos,
        roas: data.totals.overallRoas,
        spend: dailySpend,
        sales: d.adAttributedSales,
        totalSales: d.totalSales,
        // Calculate daily TACOS: daily spend / daily total sales
        tacos: d.totalSales > 0
          ? (dailySpend / d.totalSales) * 100
          : 0,
      }))
      setAcosRoasData(acosRoasTrend)
    } catch (err) {
      setKeywordsError(err instanceof Error ? err.message : 'Failed to fetch keyword data')
    } finally {
      setIsLoadingKeywords(false)
    }
  }, [dateRangePreset, customStartDate, customEndDate, selectedBrandId, salesTrendData])

  // Fetch full keyword data for table (no limit)
  const fetchFullKeywordData = useCallback(async () => {
    setIsLoadingFullKeywords(true)

    try {
      const { startDate, endDate } = getDateRange(dateRangePreset, customStartDate, customEndDate)

      const url = new URL('/api/analytics/amazon', window.location.origin)
      url.searchParams.set('startDate', startDate)
      url.searchParams.set('endDate', endDate)
      url.searchParams.set('limit', '1000') // Get all keywords
      if (selectedBrandId) {
        url.searchParams.set('brandId', selectedBrandId)
      }

      const res = await fetch(url.toString())
      if (!res.ok) {
        throw new Error('Failed to fetch full keyword data')
      }

      const data = (await res.json()) as KeywordMetricsResponse
      setFullKeywordData(data.keywords)
    } catch (err) {
      console.error('Failed to fetch full keyword data:', err)
    } finally {
      setIsLoadingFullKeywords(false)
    }
  }, [dateRangePreset, customStartDate, customEndDate, selectedBrandId])

  // Fetch campaign data
  const fetchCampaignData = useCallback(async () => {
    setIsLoadingCampaigns(true)

    try {
      const { startDate, endDate } = getDateRange(dateRangePreset, customStartDate, customEndDate)

      const url = new URL('/api/analytics/amazon', window.location.origin)
      url.searchParams.set('startDate', startDate)
      url.searchParams.set('endDate', endDate)
      url.searchParams.set('include', 'campaigns')
      if (selectedBrandId) {
        url.searchParams.set('brandId', selectedBrandId)
      }

      const res = await fetch(url.toString())
      if (!res.ok) {
        throw new Error('Failed to fetch campaign data')
      }

      const data = (await res.json()) as KeywordMetricsResponse & { campaigns?: CampaignPerformanceData[] }
      setCampaignData(data.campaigns || [])
    } catch (err) {
      console.error('Failed to fetch campaign data:', err)
    } finally {
      setIsLoadingCampaigns(false)
    }
  }, [dateRangePreset, customStartDate, customEndDate, selectedBrandId])

  // Fetch watched keywords for this brand
  const fetchWatchedKeywords = useCallback(async () => {
    if (!selectedBrandId) return

    try {
      const res = await fetch(`/api/watched-keywords?brandId=${selectedBrandId}`)
      if (res.ok) {
        const data = await res.json()
        setWatchedKeywords(
          new Set(data.watchedKeywords.map((wk: { keyword: string }) => wk.keyword))
        )
      }
    } catch (err) {
      console.error('Failed to fetch watched keywords:', err)
    }
  }, [selectedBrandId])

  // Toggle watch status for a keyword
  const handleToggleWatch = async (keyword: string) => {
    if (!selectedBrandId) return

    setIsWatchLoading(true)
    try {
      if (watchedKeywords.has(keyword)) {
        // Find the watched keyword ID and delete it
        const findRes = await fetch(`/api/watched-keywords?brandId=${selectedBrandId}`)
        if (findRes.ok) {
          const data = await findRes.json()
          const wk = data.watchedKeywords.find(
            (w: { keyword: string }) => w.keyword === keyword
          )
          if (wk) {
            await fetch(`/api/watched-keywords/${wk.id}`, { method: 'DELETE' })
          }
        }
        setWatchedKeywords((prev) => {
          const next = new Set(prev)
          next.delete(keyword)
          return next
        })
      } else {
        // Add new watched keyword
        const res = await fetch('/api/watched-keywords', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword, brandId: selectedBrandId }),
        })
        if (res.ok) {
          setWatchedKeywords((prev) => new Set(prev).add(keyword))
        }
      }
    } catch (err) {
      console.error('Failed to toggle watch:', err)
    } finally {
      setIsWatchLoading(false)
    }
  }

  // Initial data fetch
  useEffect(() => {
    fetchSalesData()
  }, [fetchSalesData])

  // Fetch keyword data after sales data is loaded
  useEffect(() => {
    if (!isLoadingSales && salesTrendData.length > 0) {
      fetchKeywordData()
    }
  }, [isLoadingSales, salesTrendData.length, fetchKeywordData])

  // Fetch table data after sales data is loaded
  useEffect(() => {
    if (!isLoadingSales && salesTrendData.length > 0) {
      fetchFullKeywordData()
      fetchCampaignData()
    }
  }, [isLoadingSales, salesTrendData.length, fetchFullKeywordData, fetchCampaignData])

  // Fetch watched keywords when brand changes
  useEffect(() => {
    if (selectedBrandId) {
      fetchWatchedKeywords()
    }
  }, [selectedBrandId, fetchWatchedKeywords])

  // Handle date range change
  const handleDateRangeChange = (
    preset: DateRangePreset,
    startDate?: string,
    endDate?: string
  ) => {
    setDateRangePreset(preset)
    setCustomStartDate(startDate)
    setCustomEndDate(endDate)
  }

  // Handle brand change
  const handleBrandChange = (brandId: string) => {
    setSelectedBrandId(brandId)
  }

  const isLoading = isLoadingSales || isLoadingKeywords
  const hasError = salesError || keywordsError

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Amazon Analytics</h1>
          <p className="text-muted-foreground">
            Sales performance and advertising metrics
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {/* Brand selector (only if multiple brands) */}
          {brands.length > 1 && (
            <select
              value={selectedBrandId}
              onChange={(e) => handleBrandChange(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          )}
          {/* Date range selector */}
          <DateRangeSelector
            value={dateRangePreset}
            customStartDate={customStartDate}
            customEndDate={customEndDate}
            onChange={handleDateRangeChange}
          />
        </div>
      </div>

      {/* Error state */}
      {hasError && !isLoading && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <p className="font-medium">Error loading data</p>
          <p className="text-sm">{salesError || keywordsError}</p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {isLoadingSales ? (
          <>
            {[1, 2, 3, 4, 5].map((i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-4 animate-pulse rounded bg-muted" />
                </CardHeader>
                <CardContent>
                  <div className="h-8 w-32 animate-pulse rounded bg-muted" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : summary ? (
          <>
            <StatCard
              title="Total Sales"
              value={formatCurrency(summary.totalSales)}
              subValue={`${summary.organicPercentage.toFixed(1)}% organic`}
              icon={DollarSign}
              trend="neutral"
            />
            <StatCard
              title="Organic Sales"
              value={formatCurrency(summary.organicSales)}
              subValue="No ad spend"
              icon={TrendingUp}
              trend="up"
            />
            <StatCard
              title="ACOS"
              value={`${summary.overallAcos.toFixed(1)}%`}
              subValue={`Spend: ${formatCurrency(summary.totalSpend)}`}
              icon={TrendingDown}
              trend={summary.overallAcos > 30 ? 'down' : 'up'}
            />
            <StatCard
              title="TACOS"
              value={`${summary.overallTacos.toFixed(1)}%`}
              subValue="Total Ad Cost of Sale"
              icon={TrendingDown}
              trend={summary.overallTacos > 15 ? 'down' : 'up'}
            />
            <StatCard
              title="ROAS"
              value={`${summary.overallRoas.toFixed(2)}x`}
              subValue="Return on ad spend"
              icon={PieChart}
              trend={summary.overallRoas >= 3 ? 'up' : summary.overallRoas >= 1 ? 'neutral' : 'down'}
            />
          </>
        ) : null}
      </div>

      {/* Sales Trend Chart (full width) */}
      <SalesTrendChart data={salesTrendData} isLoading={isLoadingSales} />

      {/* ACOS/ROAS and Pie Chart row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <AcosRoasChart data={acosRoasData} isLoading={isLoadingKeywords} />
        <OrganicVsAdChart data={organicAdBreakdown} isLoading={isLoadingSales} />
      </div>

      {/* Top Keywords Chart (full width) */}
      <KeywordPerformanceChart data={keywordData} isLoading={isLoadingKeywords} />

      {/* Data Tables Section */}
      {salesTrendData.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">Data Tables</h2>

          {/* Keyword Metrics Table - Full Width */}
          <KeywordMetricsTable
            data={fullKeywordData}
            isLoading={isLoadingFullKeywords}
            watchedKeywords={watchedKeywords}
            onToggleWatch={handleToggleWatch}
            brandId={selectedBrandId}
            isWatchLoading={isWatchLoading}
          />

          {/* Campaign and Daily Sales Tables - Side by Side on large screens */}
          <div className="grid gap-6 lg:grid-cols-2">
            <CampaignTable data={campaignData} isLoading={isLoadingCampaigns} />
            <DailySalesTable data={dailySalesTableData} isLoading={isLoadingSales} />
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !hasError && salesTrendData.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <DollarSign className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">No Sales Data</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md">
            No sales data found for the selected date range. Try selecting a different date range
            or ensure your Amazon data has been synced.
          </p>
        </div>
      )}
    </div>
  )
}
