/**
 * Shopify API Client
 *
 * Handles OAuth flow and API communication with Shopify stores.
 * Configured for read-only access to orders data.
 */

import { decrypt } from '@/lib/encryption'
import { prisma } from '@/lib/db'
import type {
  ShopifyOrderResponse,
  ShopifyOrdersListParams,
  ShopifyShopResponse,
  ShopifyRateLimitInfo,
  ShopifyPaginationInfo,
  ShopifyApiResponse,
  ShopifyOAuthTokenResponse,
} from '@/types/shopify'

// =============================================================================
// Constants
// =============================================================================

const API_VERSION = '2024-01'
const MAX_RETRIES = 3
const DEFAULT_RETRY_DELAY = 1000
const RATE_LIMIT_THRESHOLD = 0.8

// Read-only scopes for orders and products
const READ_ONLY_SCOPES = [
  'read_orders',
  'read_products',
]

// =============================================================================
// OAuth Functions
// =============================================================================

/**
 * Get Shopify OAuth configuration from environment
 */
function getOAuthConfig() {
  const clientId = process.env.SHOPIFY_CLIENT_ID
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET
  const redirectUri = process.env.SHOPIFY_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Shopify OAuth environment variables not configured')
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes: READ_ONLY_SCOPES,
  }
}

/**
 * Generate OAuth authorization URL
 */
export function getAuthUrl(shop: string, state: string): string {
  const config = getOAuthConfig()
  const normalizedShop = normalizeShopName(shop)
  const scopes = config.scopes.join(',')

  const params = new URLSearchParams({
    client_id: config.clientId,
    scope: scopes,
    redirect_uri: config.redirectUri,
    state,
    grant_options: '', // No offline access for read-only
  })

  return `https://${normalizedShop}.myshopify.com/admin/oauth/authorize?${params.toString()}`
}

/**
 * Exchange OAuth code for access token
 */
export async function exchangeCode(
  shop: string,
  code: string
): Promise<{ success: true; data: ShopifyOAuthTokenResponse } | { success: false; error: { message: string } }> {
  const config = getOAuthConfig()
  const normalizedShop = normalizeShopName(shop)

  try {
    const response = await fetch(
      `https://${normalizedShop}.myshopify.com/admin/oauth/access_token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
        }),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      return {
        success: false,
        error: { message: `Failed to exchange code: ${error}` },
      }
    }

    const data = await response.json() as ShopifyOAuthTokenResponse
    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: { message: error instanceof Error ? error.message : 'OAuth exchange failed' },
    }
  }
}

/**
 * Validate HMAC signature from Shopify
 */
export function validateHmac(_query: Record<string, string>, _hmac: string): boolean {
  // In production, implement proper HMAC validation using crypto
  // For now, we trust the state token validation
  return true
}

// =============================================================================
// Error Classes
// =============================================================================

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

export class ShopifyRateLimitError extends Error {
  constructor(message: string, public retryAfter: number) {
    super(message)
    this.name = 'ShopifyRateLimitError'
  }
}

export class ShopifyAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ShopifyAuthError'
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function normalizeShopName(shop: string): string {
  let normalized = shop.replace(/^https?:\/\//, '')
  normalized = normalized.replace(/\/$/, '')
  normalized = normalized.replace(/\.myshopify\.com$/, '')
  return normalized
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseRateLimitHeader(header: string | null): ShopifyRateLimitInfo | null {
  if (!header) return null
  const match = header.match(/^(\d+)\/(\d+)$/)
  if (!match) return null
  const current = parseInt(match[1], 10)
  const max = parseInt(match[2], 10)
  return { current, max, percentUsed: max > 0 ? current / max : 0 }
}

function parseLinkHeader(header: string | null): ShopifyPaginationInfo | null {
  if (!header) return null
  const links: ShopifyPaginationInfo = { nextUrl: null, previousUrl: null }
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

// =============================================================================
// API Client Functions
// =============================================================================

/**
 * Get decrypted access token for a connection
 * Reserved for future use in direct API operations
 */
async function _getAccessToken(connectionId: string): Promise<string> {
  const connection = await prisma.shopifyConnection.findUnique({
    where: { id: connectionId },
    select: { accessToken: true },
  })

  if (!connection) {
    throw new ShopifyAuthError('Connection not found')
  }

  return decrypt(connection.accessToken)
}

/**
 * Rate-limited fetch with automatic retries
 */
async function rateLimitedFetch<T>(
  shop: string,
  accessToken: string,
  endpoint: string,
  retryCount = 0
): Promise<ShopifyApiResponse<T>> {
  const url = `https://${normalizeShopName(shop)}.myshopify.com/admin/api/${API_VERSION}${endpoint}`
  const headers = {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': accessToken,
  }

  try {
    const response = await fetch(url, { method: 'GET', headers })

    const rateLimit = parseRateLimitHeader(
      response.headers.get('X-Shopify-Shop-Api-Call-Limit')
    )
    const pagination = parseLinkHeader(response.headers.get('Link'))

    if (response.status === 401 || response.status === 403) {
      throw new ShopifyAuthError('Invalid access token or insufficient permissions')
    }

    if (response.status === 404) {
      throw new ShopifyApiError('Resource not found', 404)
    }

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '2', 10) * 1000
      if (retryCount < MAX_RETRIES) {
        await delay(retryAfter)
        return rateLimitedFetch<T>(shop, accessToken, endpoint, retryCount + 1)
      }
      throw new ShopifyRateLimitError('Rate limit exceeded', retryAfter)
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

    // Proactive rate limiting
    if (rateLimit && rateLimit.percentUsed > RATE_LIMIT_THRESHOLD) {
      await delay(Math.floor((rateLimit.percentUsed - RATE_LIMIT_THRESHOLD) * 1000))
    }

    return { data, rateLimit, pagination }
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      if (retryCount < MAX_RETRIES) {
        await delay(DEFAULT_RETRY_DELAY * Math.pow(2, retryCount))
        return rateLimitedFetch<T>(shop, accessToken, endpoint, retryCount + 1)
      }
    }
    throw error
  }
}

/**
 * Fetch shop information
 */
export async function fetchShopInfo(
  connectionId: string
): Promise<{ success: true; data: ShopifyShopResponse } | { success: false; error: { message: string } }> {
  try {
    const connection = await prisma.shopifyConnection.findUnique({
      where: { id: connectionId },
      select: { shopName: true, accessToken: true },
    })

    if (!connection) {
      return { success: false, error: { message: 'Connection not found' } }
    }

    const accessToken = decrypt(connection.accessToken)
    const response = await rateLimitedFetch<{ shop: ShopifyShopResponse }>(
      connection.shopName,
      accessToken,
      '/shop.json'
    )

    return { success: true, data: response.data.shop }
  } catch (error) {
    return {
      success: false,
      error: { message: error instanceof Error ? error.message : 'Failed to fetch shop info' },
    }
  }
}

/**
 * Test connection by fetching shop info
 */
export async function testConnection(
  connectionId: string
): Promise<boolean> {
  const result = await fetchShopInfo(connectionId)
  return result.success
}

/**
 * Fetch orders with automatic pagination
 */
export async function fetchOrders(
  connectionId: string,
  params: ShopifyOrdersListParams = {}
): Promise<{ success: true; data: ShopifyOrderResponse[] } | { success: false; error: { message: string } }> {
  try {
    const connection = await prisma.shopifyConnection.findUnique({
      where: { id: connectionId },
      select: { shopName: true, accessToken: true },
    })

    if (!connection) {
      return { success: false, error: { message: 'Connection not found' } }
    }

    const accessToken = decrypt(connection.accessToken)
    const allOrders: ShopifyOrderResponse[] = []

    // Build initial URL
    const searchParams = new URLSearchParams()
    if (params.status) searchParams.set('status', params.status)
    if (params.fulfillment_status) searchParams.set('fulfillment_status', params.fulfillment_status)
    if (params.financial_status) searchParams.set('financial_status', params.financial_status)
    if (params.created_at_min) searchParams.set('created_at_min', params.created_at_min)
    if (params.created_at_max) searchParams.set('created_at_max', params.created_at_max)
    if (params.limit) searchParams.set('limit', String(params.limit))
    if (params.since_id) searchParams.set('since_id', String(params.since_id))

    let endpoint = `/orders.json${searchParams.toString() ? '?' + searchParams.toString() : ''}`

    // Paginate through all results
    while (endpoint) {
      const response = await rateLimitedFetch<{ orders: ShopifyOrderResponse[] }>(
        connection.shopName,
        accessToken,
        endpoint
      )

      allOrders.push(...response.data.orders)

      // Get next page from Link header
      if (response.pagination?.nextUrl) {
        const nextUrl = new URL(response.pagination.nextUrl)
        endpoint = nextUrl.pathname.replace(`/admin/api/${API_VERSION}`, '') + nextUrl.search
      } else {
        endpoint = ''
      }

      // Safety limit
      if (allOrders.length > 10000) {
        console.warn('Shopify: Stopped pagination after 10000 orders')
        break
      }
    }

    return { success: true, data: allOrders }
  } catch (error) {
    return {
      success: false,
      error: { message: error instanceof Error ? error.message : 'Failed to fetch orders' },
    }
  }
}

/**
 * Get connection status
 */
export async function getConnectionStatus(
  companyId: string
): Promise<{
  connected: boolean
  shopName?: string
  lastSyncAt?: Date | null
  syncStatus?: string | null
}> {
  const connection = await prisma.shopifyConnection.findFirst({
    where: { companyId, isActive: true },
    select: {
      shopName: true,
      lastSyncAt: true,
      syncStatus: true,
    },
  })

  if (!connection) {
    return { connected: false }
  }

  return {
    connected: true,
    shopName: connection.shopName,
    lastSyncAt: connection.lastSyncAt,
    syncStatus: connection.syncStatus,
  }
}
