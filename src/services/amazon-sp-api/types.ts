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

// ============================================
// Orders API Types
// ============================================

/**
 * Order status values from SP-API
 */
export type AmazonOrderStatus =
  | 'Pending'           // Order placed, not yet authorized
  | 'Unshipped'         // Payment authorized, awaiting shipment
  | 'PartiallyShipped'  // Some items shipped
  | 'Shipped'           // All items shipped
  | 'Canceled'          // Order canceled
  | 'Unfulfillable'     // FBA order cannot be fulfilled

/**
 * Order summary from getOrders
 */
export interface AmazonOrder {
  AmazonOrderId: string
  PurchaseDate: string        // ISO date
  LastUpdateDate: string
  OrderStatus: AmazonOrderStatus
  FulfillmentChannel: 'AFN' | 'MFN'  // Amazon or Merchant
  SalesChannel: string        // e.g., "Amazon.com"
  OrderTotal?: {
    CurrencyCode: string
    Amount: string
  }
  NumberOfItemsShipped: number
  NumberOfItemsUnshipped: number
  MarketplaceId: string
}

/**
 * Response from getOrders endpoint
 */
export interface GetOrdersResponse {
  payload: {
    Orders: AmazonOrder[]
    NextToken?: string        // For pagination
    LastUpdatedBefore?: string
    CreatedBefore?: string
  }
}

/**
 * Order item from getOrderItems
 */
export interface AmazonOrderItem {
  ASIN: string
  SellerSKU?: string
  OrderItemId: string
  Title: string
  QuantityOrdered: number
  QuantityShipped: number
  ItemPrice?: {
    CurrencyCode: string
    Amount: string
  }
  ItemTax?: {
    CurrencyCode: string
    Amount: string
  }
  ProductInfo?: {
    NumberOfItems?: number
  }
}

/**
 * Response from getOrderItems endpoint
 */
export interface GetOrderItemsResponse {
  payload: {
    AmazonOrderId: string
    OrderItems: AmazonOrderItem[]
    NextToken?: string
  }
}

/**
 * Options for fetching orders
 */
export interface GetOrdersOptions {
  createdAfter?: string      // ISO date
  createdBefore?: string     // ISO date
  lastUpdatedAfter?: string
  lastUpdatedBefore?: string
  orderStatuses?: AmazonOrderStatus[]
  marketplaceIds?: string[]
  maxResultsPerPage?: number  // 1-100, default 100
  nextToken?: string
}

/**
 * Aggregated order data for sync
 */
export interface OrderDailyAggregate {
  date: Date
  asin: string
  totalSales: number
  unitCount: number
}

/**
 * Sync result for orders
 */
export interface OrderSyncResult {
  syncLogId: string
  status: 'completed' | 'partial' | 'failed'
  ordersProcessed: number
  orderItemsProcessed: number
  salesDailyUpdated: number
  errors: string[]
  duration: number
}
