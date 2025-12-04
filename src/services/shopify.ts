/**
 * Shopify API client service
 * Handles authentication, order fetching, pagination, and rate limiting
 */

import type {
  ShopifyOrderResponse,
  ShopifyOrdersListParams,
  ShopifyProductsListParams,
  ShopifyProduct,
  ShopifyShopResponse,
  ShopifyRateLimitInfo,
  ShopifyPaginationInfo,
  ShopifyApiResponse,
  ShopifyClientConfig,
} from '@/types/shopify'

// Re-export encryption utilities for convenience
export { encryptToken, decryptToken, isEncryptionAvailable } from '@/lib/crypto'

// =============================================================================
// Constants
// =============================================================================

/** Shopify API version - use stable version as per issue spec */
const DEFAULT_API_VERSION = '2024-01'

/** Maximum retries for rate-limited requests */
const MAX_RETRIES = 3

/** Default delay between retries (ms) */
const DEFAULT_RETRY_DELAY = 1000

/** Rate limit threshold - start slowing down when usage exceeds this */
const RATE_LIMIT_THRESHOLD = 0.8 // 80%

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Error thrown when Shopify API returns an error
 */
export class ShopifyApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errors?: string | Record<string, string[]>
  ) {
    super(message)
    this.name = 'ShopifyApiError'
  }
}

/**
 * Error thrown when rate limit is exceeded
 */
export class ShopifyRateLimitError extends Error {
  constructor(
    message: string,
    public retryAfter: number
  ) {
    super(message)
    this.name = 'ShopifyRateLimitError'
  }
}

/**
 * Error thrown when authentication fails
 */
export class ShopifyAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ShopifyAuthError'
  }
}

// =============================================================================
// ShopifyClient Class
// =============================================================================

/**
 * Client for interacting with Shopify Admin API
 *
 * @example
 * const client = new ShopifyClient('my-store.myshopify.com', 'shpat_xxx')
 * const orders = await client.fetchOrders({ status: 'any', limit: 50 })
 */
export class ShopifyClient {
  private readonly shopName: string
  private readonly accessToken: string
  private readonly apiVersion: string

  constructor(shopNameOrConfig: string | ShopifyClientConfig, accessToken?: string) {
    if (typeof shopNameOrConfig === 'string') {
      // Simple constructor: (shopName, accessToken)
      if (!accessToken) {
        throw new Error('Access token is required')
      }
      this.shopName = this.normalizeShopName(shopNameOrConfig)
      this.accessToken = accessToken
      this.apiVersion = DEFAULT_API_VERSION
    } else {
      // Config object constructor
      const config = shopNameOrConfig
      if (!config.accessToken) {
        throw new Error('Access token is required')
      }
      this.shopName = this.normalizeShopName(config.shopName)
      this.accessToken = config.accessToken
      this.apiVersion = config.apiVersion || DEFAULT_API_VERSION
    }
  }

  /**
   * Normalize shop name to just the subdomain if full URL provided
   */
  private normalizeShopName(shop: string): string {
    // Remove protocol if present
    let normalized = shop.replace(/^https?:\/\//, '')
    // Remove trailing slash
    normalized = normalized.replace(/\/$/, '')
    // Remove .myshopify.com suffix if present (we'll add it back in baseUrl)
    normalized = normalized.replace(/\.myshopify\.com$/, '')
    return normalized
  }

  /**
   * Get the base URL for API requests
   */
  private get baseUrl(): string {
    return `https://${this.shopName}.myshopify.com/admin/api/${this.apiVersion}`
  }

  /**
   * Build headers for API requests
   */
  private get headers(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': this.accessToken,
    }
  }

  // ===========================================================================
  // Public API Methods
  // ===========================================================================

  /**
   * Test connection to Shopify API by fetching shop info
   * @returns true if connection is successful, false otherwise
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.fetchShopInfo()
      return true
    } catch (error) {
      if (error instanceof ShopifyAuthError) {
        return false
      }
      // Network errors should also return false
      if (error instanceof Error && error.message.includes('fetch failed')) {
        return false
      }
      throw error
    }
  }

  /**
   * Fetch shop information
   * @returns Shop details
   */
  async fetchShopInfo(): Promise<ShopifyShopResponse> {
    const response = await this.rateLimitedFetch<{ shop: ShopifyShopResponse }>(
      `${this.baseUrl}/shop.json`
    )
    return response.data.shop
  }

  /**
   * Fetch a single order by ID
   * @param orderId - The order ID
   * @returns The order or null if not found
   */
  async fetchOrder(orderId: number): Promise<ShopifyOrderResponse> {
    const response = await this.rateLimitedFetch<{ order: ShopifyOrderResponse }>(
      `${this.baseUrl}/orders/${orderId}.json`
    )
    return response.data.order
  }

  /**
   * Fetch orders with optional filtering and automatic pagination
   * @param params - Query parameters for filtering orders
   * @returns Array of orders
   */
  async fetchOrders(params: ShopifyOrdersListParams = {}): Promise<ShopifyOrderResponse[]> {
    const allOrders: ShopifyOrderResponse[] = []
    let url: string | null = this.buildOrdersUrl(params)

    while (url) {
      const response: ShopifyApiResponse<{ orders: ShopifyOrderResponse[] }> =
        await this.rateLimitedFetch<{ orders: ShopifyOrderResponse[] }>(url)
      allOrders.push(...response.data.orders)

      // Check for next page
      url = response.pagination?.nextUrl || null

      // Safety check to avoid infinite loops
      if (allOrders.length > 10000) {
        console.warn('ShopifyClient: Stopped pagination after 10000 orders')
        break
      }
    }

    return allOrders
  }

  /**
   * Fetch products with optional filtering and automatic pagination
   * @param params - Query parameters for filtering products
   * @returns Array of products
   */
  async fetchProducts(params: ShopifyProductsListParams = {}): Promise<ShopifyProduct[]> {
    const allProducts: ShopifyProduct[] = []
    let url: string | null = this.buildProductsUrl(params)

    while (url) {
      const response: ShopifyApiResponse<{ products: ShopifyProduct[] }> =
        await this.rateLimitedFetch<{ products: ShopifyProduct[] }>(url)
      allProducts.push(...response.data.products)

      // Check for next page
      url = response.pagination?.nextUrl || null

      // Safety check
      if (allProducts.length > 10000) {
        console.warn('ShopifyClient: Stopped pagination after 10000 products')
        break
      }
    }

    return allProducts
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  /**
   * Build URL for orders endpoint with query parameters
   */
  private buildOrdersUrl(params: ShopifyOrdersListParams): string {
    const url = new URL(`${this.baseUrl}/orders.json`)
    const searchParams = new URLSearchParams()

    if (params.status) searchParams.set('status', params.status)
    if (params.fulfillment_status) searchParams.set('fulfillment_status', params.fulfillment_status)
    if (params.financial_status) searchParams.set('financial_status', params.financial_status)
    if (params.created_at_min) searchParams.set('created_at_min', params.created_at_min)
    if (params.created_at_max) searchParams.set('created_at_max', params.created_at_max)
    if (params.updated_at_min) searchParams.set('updated_at_min', params.updated_at_min)
    if (params.updated_at_max) searchParams.set('updated_at_max', params.updated_at_max)
    if (params.limit) searchParams.set('limit', String(params.limit))
    if (params.since_id) searchParams.set('since_id', String(params.since_id))
    if (params.fields) searchParams.set('fields', params.fields)

    const queryString = searchParams.toString()
    return queryString ? `${url.href}?${queryString}` : url.href
  }

  /**
   * Build URL for products endpoint with query parameters
   */
  private buildProductsUrl(params: ShopifyProductsListParams): string {
    const url = new URL(`${this.baseUrl}/products.json`)
    const searchParams = new URLSearchParams()

    if (params.status) searchParams.set('status', params.status)
    if (params.limit) searchParams.set('limit', String(params.limit))
    if (params.since_id) searchParams.set('since_id', String(params.since_id))
    if (params.created_at_min) searchParams.set('created_at_min', params.created_at_min)
    if (params.created_at_max) searchParams.set('created_at_max', params.created_at_max)
    if (params.fields) searchParams.set('fields', params.fields)

    const queryString = searchParams.toString()
    return queryString ? `${url.href}?${queryString}` : url.href
  }

  /**
   * Perform a rate-limited fetch with automatic retries
   * Handles rate limiting, auth errors, and pagination
   */
  private async rateLimitedFetch<T>(
    url: string,
    retryCount = 0
  ): Promise<ShopifyApiResponse<T>> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers,
      })

      // Parse rate limit info from headers
      const rateLimit = this.parseRateLimitHeader(
        response.headers.get('X-Shopify-Shop-Api-Call-Limit')
      )

      // Parse pagination from Link header
      const pagination = this.parseLinkHeader(response.headers.get('Link'))

      // Handle different response statuses
      if (response.status === 401 || response.status === 403) {
        throw new ShopifyAuthError('Invalid access token or insufficient permissions')
      }

      if (response.status === 404) {
        throw new ShopifyApiError('Resource not found', 404)
      }

      if (response.status === 429) {
        // Rate limited - get retry delay from header or use default
        const retryAfter = parseInt(response.headers.get('Retry-After') || '2', 10) * 1000

        if (retryCount < MAX_RETRIES) {
          console.warn(`ShopifyClient: Rate limited, retrying in ${retryAfter}ms...`)
          await this.delay(retryAfter)
          return this.rateLimitedFetch<T>(url, retryCount + 1)
        }

        throw new ShopifyRateLimitError('Rate limit exceeded after max retries', retryAfter)
      }

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}))
        throw new ShopifyApiError(
          `Shopify API error: ${response.statusText}`,
          response.status,
          errorBody.errors
        )
      }

      const data = await response.json() as T

      // Proactive rate limit handling - slow down if approaching limit
      if (rateLimit && rateLimit.percentUsed > RATE_LIMIT_THRESHOLD) {
        const slowdownDelay = Math.floor((rateLimit.percentUsed - RATE_LIMIT_THRESHOLD) * 1000)
        await this.delay(slowdownDelay)
      }

      return { data, rateLimit, pagination }
    } catch (error) {
      // Handle network errors with retries
      if (error instanceof TypeError && error.message.includes('fetch')) {
        if (retryCount < MAX_RETRIES) {
          const delay = DEFAULT_RETRY_DELAY * Math.pow(2, retryCount) // Exponential backoff
          console.warn(`ShopifyClient: Network error, retrying in ${delay}ms...`)
          await this.delay(delay)
          return this.rateLimitedFetch<T>(url, retryCount + 1)
        }
      }

      throw error
    }
  }

  /**
   * Parse the X-Shopify-Shop-Api-Call-Limit header
   * Format: "32/40" (current/max)
   */
  private parseRateLimitHeader(header: string | null): ShopifyRateLimitInfo | null {
    if (!header) return null

    const match = header.match(/^(\d+)\/(\d+)$/)
    if (!match) return null

    const current = parseInt(match[1], 10)
    const max = parseInt(match[2], 10)

    return {
      current,
      max,
      percentUsed: max > 0 ? current / max : 0,
    }
  }

  /**
   * Parse the Link header for pagination
   * Format: <url>; rel="next", <url>; rel="previous"
   */
  private parseLinkHeader(header: string | null): ShopifyPaginationInfo | null {
    if (!header) return null

    const links: ShopifyPaginationInfo = {
      nextUrl: null,
      previousUrl: null,
    }

    const parts = header.split(',')
    for (const part of parts) {
      const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/)
      if (match) {
        const [, url, rel] = match
        if (rel === 'next') links.nextUrl = url
        if (rel === 'previous') links.previousUrl = url
      }
    }

    return links
  }

  /**
   * Simple delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
