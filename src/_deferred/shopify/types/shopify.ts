/**
 * [V2-DEFERRED] Shopify API Types
 * Moved from src/types/shopify.ts on 2025-12-06
 * Reason: PRD V1 explicitly excludes integrations
 * Restore: Move back to src/types/ when V2 work begins
 */

/**
 * Shopify API type definitions
 * Used by ShopifyClient service for type-safe API interactions
 */

// =============================================================================
// Core Order Types
// =============================================================================

/**
 * Line item within a Shopify order
 */
export interface ShopifyLineItem {
  id: number
  variant_id: number | null
  sku: string | null
  title: string
  quantity: number
  price: string
  product_id: number | null
  fulfillable_quantity: number
  fulfillment_status: string | null
}

/**
 * Order response from Shopify API
 */
export interface ShopifyOrderResponse {
  id: number
  order_number: number
  name: string // e.g., "#1001"
  created_at: string
  updated_at: string
  closed_at: string | null
  cancelled_at: string | null
  fulfillment_status: 'fulfilled' | 'partial' | 'unfulfilled' | null
  financial_status: 'pending' | 'authorized' | 'partially_paid' | 'paid' | 'partially_refunded' | 'refunded' | 'voided'
  currency: string
  total_price: string
  subtotal_price: string
  total_tax: string
  line_items: ShopifyLineItem[]
  note: string | null
  tags: string
  email: string | null
}

/**
 * Shopify product response
 */
export interface ShopifyProduct {
  id: number
  title: string
  handle: string
  status: 'active' | 'archived' | 'draft'
  variants: ShopifyVariant[]
  created_at: string
  updated_at: string
}

/**
 * Shopify product variant
 */
export interface ShopifyVariant {
  id: number
  product_id: number
  title: string
  sku: string | null
  price: string
  inventory_quantity: number
  inventory_item_id: number
}

/**
 * Shopify shop info response
 */
export interface ShopifyShopResponse {
  id: number
  name: string
  email: string
  domain: string
  myshopify_domain: string
  plan_name: string
  currency: string
  timezone: string
}

// =============================================================================
// Query Parameters
// =============================================================================

/**
 * Parameters for listing orders from Shopify API
 */
export interface ShopifyOrdersListParams {
  status?: 'open' | 'closed' | 'cancelled' | 'any'
  fulfillment_status?: 'shipped' | 'partial' | 'unshipped' | 'any' | 'unfulfilled'
  financial_status?: 'paid' | 'pending' | 'any' | 'authorized' | 'partially_paid' | 'refunded' | 'partially_refunded' | 'voided'
  created_at_min?: string
  created_at_max?: string
  updated_at_min?: string
  updated_at_max?: string
  limit?: number
  since_id?: number
  fields?: string
}

/**
 * Parameters for listing products from Shopify API
 */
export interface ShopifyProductsListParams {
  status?: 'active' | 'archived' | 'draft' | 'any'
  limit?: number
  since_id?: number
  created_at_min?: string
  created_at_max?: string
  fields?: string
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Shopify API error response structure
 */
export interface ShopifyApiError {
  errors: string | Record<string, string[]>
}

/**
 * Rate limit information from Shopify response headers
 */
export interface ShopifyRateLimitInfo {
  /** Current usage, e.g., "32" from "32/40" */
  current: number
  /** Maximum allowed, e.g., "40" from "32/40" */
  max: number
  /** Percentage of rate limit used */
  percentUsed: number
}

// =============================================================================
// Pagination Types
// =============================================================================

/**
 * Parsed pagination info from Shopify Link header
 */
export interface ShopifyPaginationInfo {
  nextUrl: string | null
  previousUrl: string | null
}

// =============================================================================
// Client Configuration
// =============================================================================

/**
 * Configuration for ShopifyClient
 */
export interface ShopifyClientConfig {
  shopName: string
  accessToken: string
  apiVersion?: string
}

// =============================================================================
// Response Wrappers
// =============================================================================

/**
 * Wrapped response including rate limit info
 */
export interface ShopifyApiResponse<T> {
  data: T
  rateLimit: ShopifyRateLimitInfo | null
  pagination: ShopifyPaginationInfo | null
}
