/**
 * Amazon SP-API (Selling Partner API) Types
 *
 * Type definitions for Amazon Selling Partner API integration.
 * Used for read-only access to sales and orders data.
 */

// ============================================
// OAuth & Authentication Types
// ============================================

export interface AmazonSpTokenResponse {
  access_token: string
  refresh_token?: string // May not be returned on refresh
  token_type: string // "bearer"
  expires_in: number // seconds until expiration (typically 3600)
}

export interface AmazonSpCredential {
  accessToken: string
  refreshToken: string
  expiresAt: Date
  sellerId?: string
  marketplaceId?: string
}

export interface AmazonSpOAuthState {
  state: string
  companyId: string
  brandId?: string
  createdAt: Date
}

// ============================================
// Seller Account Types
// ============================================

export interface AmazonSpSellerAccount {
  sellerId: string
  marketplaceId: string
  businessName?: string
  countryCode: string // "US"
}

// ============================================
// API Configuration Types
// ============================================

export interface SpApiConfig {
  accessToken: string
  region: 'na' | 'eu' | 'fe' // North America, Europe, Far East
  awsAccessKeyId: string
  awsSecretAccessKey: string
}

export interface SpApiRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  body?: unknown
  queryParams?: Record<string, string>
}

// ============================================
// API Error Types
// ============================================

export interface AmazonSpError {
  code: string
  message: string
  details?: string
}

export interface AmazonSpApiResponse<T> {
  success: boolean
  data?: T
  error?: AmazonSpError
}

// ============================================
// Rate Limiting Types
// ============================================

export interface SpApiRateLimit {
  rate: number // Requests per second
  burst: number // Max burst size
}

// ============================================
// Marketplace Constants
// ============================================

export const SP_API_REGIONS = {
  na: {
    endpoint: 'https://sellingpartnerapi-na.amazon.com',
    awsRegion: 'us-east-1',
    marketplaces: ['ATVPDKIKX0DER'], // US
  },
  eu: {
    endpoint: 'https://sellingpartnerapi-eu.amazon.com',
    awsRegion: 'eu-west-1',
    marketplaces: ['A1PA6795UKMFR9'], // DE
  },
  fe: {
    endpoint: 'https://sellingpartnerapi-fe.amazon.com',
    awsRegion: 'us-west-2',
    marketplaces: ['A1VC38T7YXB528'], // JP
  },
} as const

export type SpApiRegion = keyof typeof SP_API_REGIONS

// ============================================
// Connection Status Types (for status endpoint)
// ============================================

export interface SpApiConnectionStatus {
  id: string
  brandId: string | null
  brandName?: string
  status: 'active' | 'expired' | 'revoked' | 'error'
  sellerId?: string | null
  businessName?: string | null
  lastSyncAt?: Date | null
  lastSyncStatus?: string | null
  lastError?: string | null
  createdAt: string
}
