/**
 * Amazon SP-API Orders Service
 *
 * Fetches order and order item data from Amazon Selling Partner API.
 * Used to populate SalesDaily with sales volume data.
 *
 * Rate limits:
 * - getOrders: 0.0167 requests/sec (1 per minute)
 * - getOrderItems: 0.5 requests/sec (1 per 2 seconds)
 */

import { getValidAccessToken } from './client'
import type {
  AmazonSpApiResponse,
  GetOrdersResponse,
  GetOrderItemsResponse,
  GetOrdersOptions,
  AmazonOrder,
  AmazonOrderItem,
} from './types'
import aws4 from 'aws4'

// ============================================
// Configuration
// ============================================

const SP_API_BASE_NA = 'https://sellingpartnerapi-na.amazon.com'
const US_MARKETPLACE_ID = 'ATVPDKIKX0DER'

// Rate limiting delays (ms)
const GET_ORDERS_DELAY = 1100       // ~1 req/sec for safety
const GET_ORDER_ITEMS_DELAY = 2100  // ~0.5 req/sec

// ============================================
// Helper Functions
// ============================================

function getAwsCredentials(): { accessKeyId: string; secretAccessKey: string } {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('AWS credentials required for SP-API')
  }
  return { accessKeyId, secretAccessKey }
}

function signRequest(
  method: string,
  path: string,
  accessToken: string,
  body?: string
): { url: string; headers: Record<string, string> } {
  const { accessKeyId, secretAccessKey } = getAwsCredentials()
  const url = new URL(path, SP_API_BASE_NA)

  const opts: aws4.Request = {
    host: url.hostname,
    path: url.pathname + url.search,
    method,
    service: 'execute-api',
    region: 'us-east-1',
    headers: {
      'x-amz-access-token': accessToken,
      'Content-Type': 'application/json',
      'User-Agent': 'TrevorInventory/1.0 (Language=Node.js)',
    },
    body,
  }

  aws4.sign(opts, { accessKeyId, secretAccessKey })

  return {
    url: url.toString(),
    headers: opts.headers as Record<string, string>,
  }
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================
// Orders API Methods
// ============================================

/**
 * Fetch orders from SP-API with pagination support
 */
export async function getOrders(
  credentialId: string,
  options: GetOrdersOptions = {}
): Promise<AmazonSpApiResponse<AmazonOrder[]>> {
  const allOrders: AmazonOrder[] = []
  let nextToken = options.nextToken

  // Get valid access token
  const tokenResult = await getValidAccessToken(credentialId)
  if (!tokenResult.success || !tokenResult.data) {
    return {
      success: false,
      error: tokenResult.error || { code: 'TOKEN_ERROR', message: 'Failed to get access token' },
    }
  }
  const accessToken = tokenResult.data

  try {
    do {
      // Build query params
      const params = new URLSearchParams()
      params.set('MarketplaceIds', options.marketplaceIds?.join(',') || US_MARKETPLACE_ID)

      if (nextToken) {
        params.set('NextToken', nextToken)
      } else {
        if (options.createdAfter) params.set('CreatedAfter', options.createdAfter)
        if (options.createdBefore) params.set('CreatedBefore', options.createdBefore)
        if (options.lastUpdatedAfter) params.set('LastUpdatedAfter', options.lastUpdatedAfter)
        if (options.lastUpdatedBefore) params.set('LastUpdatedBefore', options.lastUpdatedBefore)
        if (options.orderStatuses) {
          params.set('OrderStatuses', options.orderStatuses.join(','))
        }
        params.set('MaxResultsPerPage', String(options.maxResultsPerPage || 100))
      }

      const path = `/orders/v0/orders?${params.toString()}`
      const signed = signRequest('GET', path, accessToken)

      const response = await fetch(signed.url, {
        method: 'GET',
        headers: signed.headers,
      })

      if (!response.ok) {
        const errorText = await response.text()

        // Handle rate limiting
        if (response.status === 429) {
          console.warn('SP-API rate limited, waiting before retry...')
          await delay(5000)
          continue
        }

        return {
          success: false,
          error: {
            code: 'API_ERROR',
            message: `getOrders failed: ${response.status}`,
            details: errorText,
          },
        }
      }

      const data = await response.json() as GetOrdersResponse
      allOrders.push(...data.payload.Orders)
      nextToken = data.payload.NextToken

      // Rate limiting delay
      if (nextToken) {
        await delay(GET_ORDERS_DELAY)
      }

      // Safety limit
      if (allOrders.length > 5000) {
        console.warn('SP-API: Stopped pagination after 5000 orders')
        break
      }

    } while (nextToken)

    return { success: true, data: allOrders }

  } catch (error) {
    return {
      success: false,
      error: {
        code: 'ORDERS_FETCH_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error fetching orders',
      },
    }
  }
}

/**
 * Fetch order items for a specific order
 */
export async function getOrderItems(
  credentialId: string,
  orderId: string
): Promise<AmazonSpApiResponse<AmazonOrderItem[]>> {
  const allItems: AmazonOrderItem[] = []
  let nextToken: string | undefined

  // Get valid access token
  const tokenResult = await getValidAccessToken(credentialId)
  if (!tokenResult.success || !tokenResult.data) {
    return {
      success: false,
      error: tokenResult.error || { code: 'TOKEN_ERROR', message: 'Failed to get access token' },
    }
  }
  const accessToken = tokenResult.data

  try {
    do {
      let path = `/orders/v0/orders/${orderId}/orderItems`
      if (nextToken) {
        path += `?NextToken=${encodeURIComponent(nextToken)}`
      }

      const signed = signRequest('GET', path, accessToken)

      const response = await fetch(signed.url, {
        method: 'GET',
        headers: signed.headers,
      })

      if (!response.ok) {
        const errorText = await response.text()

        // Handle rate limiting
        if (response.status === 429) {
          console.warn('SP-API rate limited on orderItems, waiting...')
          await delay(5000)
          continue
        }

        return {
          success: false,
          error: {
            code: 'API_ERROR',
            message: `getOrderItems failed: ${response.status}`,
            details: errorText,
          },
        }
      }

      const data = await response.json() as GetOrderItemsResponse
      allItems.push(...data.payload.OrderItems)
      nextToken = data.payload.NextToken

      // Rate limiting delay
      if (nextToken) {
        await delay(GET_ORDER_ITEMS_DELAY)
      }

    } while (nextToken)

    return { success: true, data: allItems }

  } catch (error) {
    return {
      success: false,
      error: {
        code: 'ORDER_ITEMS_FETCH_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error fetching order items',
      },
    }
  }
}

/**
 * Check if an order should be counted as a completed sale
 * Only count Shipped and Delivered statuses
 */
export function isCompletedOrder(order: AmazonOrder): boolean {
  return order.OrderStatus === 'Shipped' || order.OrderStatus === 'PartiallyShipped'
}
