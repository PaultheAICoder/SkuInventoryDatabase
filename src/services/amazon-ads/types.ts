/**
 * Amazon Ads API Types
 *
 * Type definitions for Amazon Advertising API integration.
 * Based on Amazon Advertising API v3.
 */

// ============================================
// OAuth & Authentication Types
// ============================================

export interface AmazonAdsTokenResponse {
  access_token: string
  refresh_token: string
  token_type: string // "bearer"
  expires_in: number // seconds until expiration (typically 3600)
}

export interface AmazonAdsCredential {
  accessToken: string
  refreshToken: string
  expiresAt: Date
  profileId?: string
  accountName?: string
}

export interface AmazonOAuthState {
  state: string
  companyId: string
  brandId?: string
  createdAt: Date
}

// ============================================
// Profile Types (Account Selection)
// ============================================

export interface AmazonAdsProfile {
  profileId: number
  countryCode: string // "US"
  currencyCode: string // "USD"
  dailyBudget?: number
  timezone: string // "America/Los_Angeles"
  accountInfo: AmazonAdsAccountInfo
}

export interface AmazonAdsAccountInfo {
  marketplaceStringId: string // "ATVPDKIKX0DER" for US marketplace
  id: string // Amazon account ID
  type: 'seller' | 'vendor' | 'agency'
  name: string // Account display name
  validPaymentMethod: boolean
}

// ============================================
// Portfolio Types
// ============================================

export interface AmazonAdsPortfolio {
  portfolioId: number
  name: string
  state: 'enabled' | 'paused' | 'archived'
  budget?: AmazonAdsBudget
  inBudget?: boolean
  creationDate?: number // epoch timestamp
  lastUpdatedDate?: number
  servingStatus?: string
}

export interface AmazonAdsBudget {
  amount: number
  currencyCode: string // "USD"
  policy: 'dateRange' | 'monthlyRecurring'
  startDate?: string // YYYYMMDD
  endDate?: string
}

// ============================================
// Campaign Types
// ============================================

export type CampaignType = 'sponsoredProducts' | 'sponsoredBrands' | 'sponsoredDisplay'
export type TargetingType = 'manual' | 'auto'
export type CampaignState = 'enabled' | 'paused' | 'archived'

export interface AmazonAdsCampaign {
  campaignId: number
  portfolioId?: number
  name: string
  campaignType: CampaignType
  targetingType?: TargetingType
  state: CampaignState
  dailyBudget?: number
  startDate?: string // YYYYMMDD
  endDate?: string
  servingStatus?: string
  creationDate?: number
  lastUpdatedDate?: number
}

// ============================================
// Ad Group Types
// ============================================

export interface AmazonAdsAdGroup {
  adGroupId: number
  campaignId: number
  name: string
  state: 'enabled' | 'paused' | 'archived'
  defaultBid?: number
  servingStatus?: string
  creationDate?: number
  lastUpdatedDate?: number
}

// ============================================
// Report Types
// ============================================

export type ReportType =
  | 'spSearchTerm'
  | 'spTargeting'
  | 'spAdvertisedProduct'
  | 'spPurchasedProduct'
  | 'sbSearchTerm'
  | 'sdSearchTerm'

export interface ReportRequest {
  reportType: ReportType
  startDate: string // YYYY-MM-DD
  endDate: string
  columns?: string[]
  groupBy?: string[]
  filters?: ReportFilter[]
}

export interface ReportFilter {
  field: string
  values: string[]
}

export interface ReportResponse {
  reportId: string
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
  statusDetails?: string
  location?: string // Download URL when completed
  fileSize?: number
  createdAt?: string
  completedAt?: string
}

export interface ReportMetrics {
  campaignName?: string
  adGroupName?: string
  portfolioName?: string
  keyword?: string
  searchTerm?: string
  matchType?: 'exact' | 'phrase' | 'broad' | 'auto'
  impressions: number
  clicks: number
  cost: number // in account currency
  orders: number
  sales: number
  acos?: number // Advertising Cost of Sales (cost/sales)
  roas?: number // Return on Ad Spend (sales/cost)
  ctr?: number // Click-through rate (clicks/impressions)
  cpc?: number // Cost per click (cost/clicks)
  conversionRate?: number // orders/clicks
  date: string // YYYY-MM-DD
}

// ============================================
// API Error Types
// ============================================

export interface AmazonAdsError {
  code: string
  message: string
  details?: string
}

export interface AmazonAdsApiResponse<T> {
  success: boolean
  data?: T
  error?: AmazonAdsError
}

// ============================================
// Sync Types
// ============================================

export interface SyncOptions {
  credentialId: string
  syncType: 'full' | 'incremental'
  dateRange: {
    startDate: string // YYYY-MM-DD
    endDate: string
  }
}

export interface SyncResult {
  syncLogId: string
  status: 'completed' | 'failed' | 'partial'
  recordsProcessed: number
  recordsCreated: number
  recordsUpdated: number
  recordsFailed: number
  errors: string[]
  duration: number // milliseconds
}
