/**
 * Amazon Analytics Types
 * Types for Amazon analytics dashboard charts and data
 */

// Date range preset type
export type DateRangePreset = '7d' | '30d' | '90d' | 'custom'

// Sales trend data point for charting
export interface SalesTrendDataPoint {
  date: string // YYYY-MM-DD
  totalSales: number
  adAttributedSales: number
  organicSales: number
}

// ACOS/ROAS/TACOS trend data point
export interface AcosRoasDataPoint {
  date: string
  acos: number // percentage - Advertising Cost of Sale (Ad Spend / Ad Sales)
  roas: number // ratio - Return on Ad Spend (Ad Sales / Ad Spend)
  tacos: number // percentage - Total Advertising Cost of Sale (Ad Spend / Total Sales)
  spend: number
  sales: number // ad-attributed sales
  totalSales: number // total sales (organic + ad-attributed) for TACOS context
}

// Organic vs Ad breakdown for pie chart
export interface OrganicAdBreakdown {
  organic: number
  adAttributed: number
  organicPercentage: number
  adPercentage: number
}

// Keyword performance data
export interface KeywordPerformanceData {
  keyword: string
  spend: number
  sales: number
  impressions: number
  clicks: number
  acos: number
  roas: number
  orders: number
  matchType?: string // exact, phrase, broad, auto
  ctr?: number // click-through rate percentage
}

// Campaign performance data for table display
export interface CampaignPerformanceData {
  campaignId: string
  name: string
  campaignType: string // sponsoredProducts, sponsoredBrands, sponsoredDisplay
  state: string // enabled, paused, archived
  dailyBudget: number | null
  spend: number
  sales: number
  impressions: number
  clicks: number
  orders: number
  acos: number
  roas: number
}

// Daily sales table data
export interface DailySalesTableData {
  date: string
  totalSales: number
  adAttributedSales: number
  organicSales: number
  organicPercentage: number
  orderCount: number
}

// Campaign metrics API response
export interface CampaignMetricsResponse {
  campaigns: CampaignPerformanceData[]
  dateRange: {
    startDate: string
    endDate: string
  }
  totals: {
    totalSpend: number
    totalSales: number
    campaignCount: number
  }
}

// Summary stats for dashboard
export interface AmazonAnalyticsSummary {
  totalSales: number
  organicSales: number
  adAttributedSales: number
  organicPercentage: number
  totalSpend: number
  overallAcos: number
  overallTacos: number // Total Advertising Cost of Sale (Ad Spend / Total Sales)
  overallRoas: number
}

// Keyword metrics API response
export interface KeywordMetricsResponse {
  keywords: KeywordPerformanceData[]
  dateRange: {
    startDate: string
    endDate: string
  }
  totals: {
    totalSpend: number
    totalSales: number // ad-attributed sales
    totalImpressions: number
    totalClicks: number
    overallAcos: number
    overallTacos: number // placeholder - frontend calculates from combined data
    overallRoas: number
  }
}
