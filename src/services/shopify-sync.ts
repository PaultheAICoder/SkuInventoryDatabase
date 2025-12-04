/**
 * Shopify Order Sync Service
 * Handles order synchronization from Shopify, including:
 * - Fetching orders from Shopify API
 * - Idempotent upsert of orders
 * - SKU mapping lookup
 * - Sync status management
 */

import { prisma } from '@/lib/db'
import { decryptToken } from '@/lib/crypto'
import { ShopifyClient } from '@/services/shopify'
import type { ShopifyOrderResponse } from '@/types/shopify'
import type { SyncResult } from '@/types/shopify-sync'
import { Prisma, ShopifyOrderStatus } from '@prisma/client'

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get an active Shopify connection for a company
 * Returns connection with decrypted access token, or null if not found/inactive
 */
export async function getActiveConnection(companyId: string): Promise<{
  connection: { id: string; shopName: string; companyId: string }
  client: ShopifyClient
} | null> {
  const connection = await prisma.shopifyConnection.findUnique({
    where: { companyId },
    select: {
      id: true,
      shopName: true,
      companyId: true,
      accessToken: true,
      isActive: true,
    },
  })

  if (!connection || !connection.isActive || !connection.accessToken) {
    return null
  }

  try {
    const decryptedToken = decryptToken(connection.accessToken)
    const client = new ShopifyClient(connection.shopName, decryptedToken)
    return {
      connection: {
        id: connection.id,
        shopName: connection.shopName,
        companyId: connection.companyId,
      },
      client,
    }
  } catch {
    return null
  }
}

/**
 * Look up internal SKU ID for a Shopify variant ID
 * Returns the mapped SKU ID and status
 */
export async function lookupSkuMapping(
  companyId: string,
  variantId: string | null
): Promise<{ skuId: string | null; status: 'mapped' | 'unmapped' | 'not_found' }> {
  if (!variantId) {
    return { skuId: null, status: 'unmapped' }
  }

  const mapping = await prisma.skuChannelMapping.findUnique({
    where: {
      companyId_channelType_externalId: {
        companyId,
        channelType: 'shopify',
        externalId: variantId,
      },
    },
    select: { skuId: true, isActive: true },
  })

  if (!mapping) {
    return { skuId: null, status: 'not_found' }
  }

  if (!mapping.isActive) {
    return { skuId: null, status: 'not_found' }
  }

  return { skuId: mapping.skuId, status: 'mapped' }
}

// =============================================================================
// Main Sync Function
// =============================================================================

/**
 * Sync orders from Shopify for a company
 * - Fetches orders within date range
 * - Upserts orders (idempotent by shopifyOrderId)
 * - Maps line items to internal SKUs
 * - Sets order status based on mapping results
 */
export async function syncOrders(params: {
  companyId: string
  createdAtMin?: string
  createdAtMax?: string
  fullSync?: boolean
}): Promise<SyncResult> {
  const { companyId, createdAtMin, createdAtMax, fullSync } = params
  const startTime = Date.now()

  const result: SyncResult = {
    ordersProcessed: 0,
    ordersCreated: 0,
    ordersUpdated: 0,
    linesProcessed: 0,
    linesMapped: 0,
    linesUnmapped: 0,
    errors: [],
    syncDuration: 0,
  }

  // Get active connection
  const activeConnection = await getActiveConnection(companyId)
  if (!activeConnection) {
    throw new Error('No active Shopify connection found')
  }

  const { connection, client } = activeConnection

  // Update sync status to 'syncing'
  await prisma.shopifyConnection.update({
    where: { id: connection.id },
    data: { syncStatus: 'syncing' },
  })

  try {
    // Build fetch params
    const fetchParams: {
      status: 'any'
      created_at_min?: string
      created_at_max?: string
    } = {
      status: 'any',
    }

    if (createdAtMin) fetchParams.created_at_min = createdAtMin
    if (createdAtMax) fetchParams.created_at_max = createdAtMax

    // If not fullSync and no date range, use lastSyncAt
    if (!fullSync && !createdAtMin && !createdAtMax) {
      const conn = await prisma.shopifyConnection.findUnique({
        where: { id: connection.id },
        select: { lastSyncAt: true },
      })
      if (conn?.lastSyncAt) {
        fetchParams.created_at_min = conn.lastSyncAt.toISOString()
      }
    }

    // Fetch orders from Shopify
    const orders = await client.fetchOrders(fetchParams)

    // Process each order
    for (const order of orders) {
      try {
        await processOrder(connection.id, companyId, order, result)
        result.ordersProcessed++
      } catch (error) {
        result.errors.push({
          orderId: String(order.id),
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    // Update connection with sync completion
    await prisma.shopifyConnection.update({
      where: { id: connection.id },
      data: {
        lastSyncAt: new Date(),
        syncStatus: 'idle',
      },
    })
  } catch (error) {
    // Update connection with error status
    await prisma.shopifyConnection.update({
      where: { id: connection.id },
      data: { syncStatus: 'error' },
    })
    throw error
  }

  result.syncDuration = Date.now() - startTime
  return result
}

// =============================================================================
// Order Processing
// =============================================================================

/**
 * Process a single Shopify order
 * - Upserts order record
 * - Processes line items with mapping lookup
 * - Determines order status based on line mappings
 */
async function processOrder(
  connectionId: string,
  companyId: string,
  shopifyOrder: ShopifyOrderResponse,
  result: SyncResult
): Promise<void> {
  const shopifyOrderId = String(shopifyOrder.id)

  // Check if order exists
  const existingOrder = await prisma.shopifyOrder.findUnique({
    where: {
      connectionId_shopifyOrderId: {
        connectionId,
        shopifyOrderId,
      },
    },
    select: { id: true },
  })

  // Process line items first to determine status
  const lineData: Array<{
    shopifyLineId: string
    shopifyVariantId: string | null
    shopifySku: string | null
    title: string
    quantity: number
    price: Prisma.Decimal
    mappedSkuId: string | null
    mappingStatus: string
  }> = []

  for (const lineItem of shopifyOrder.line_items) {
    const variantId = lineItem.variant_id ? String(lineItem.variant_id) : null
    const mapping = await lookupSkuMapping(companyId, variantId)

    if (mapping.status !== 'mapped') {
      result.linesUnmapped++
    } else {
      result.linesMapped++
    }
    result.linesProcessed++

    lineData.push({
      shopifyLineId: String(lineItem.id),
      shopifyVariantId: variantId,
      shopifySku: lineItem.sku || null,
      title: lineItem.title,
      quantity: lineItem.quantity,
      price: new Prisma.Decimal(lineItem.price),
      mappedSkuId: mapping.skuId,
      mappingStatus: mapping.status,
    })
  }

  // Determine initial order status - always start as pending
  const orderStatus: ShopifyOrderStatus = 'pending'

  if (existingOrder) {
    // Update existing order
    await prisma.$transaction(async (tx) => {
      // Delete existing lines
      await tx.shopifyOrderLine.deleteMany({
        where: { orderId: existingOrder.id },
      })

      // Update order
      await tx.shopifyOrder.update({
        where: { id: existingOrder.id },
        data: {
          shopifyOrderNumber: shopifyOrder.name,
          orderDate: new Date(shopifyOrder.created_at),
          fulfillmentStatus: shopifyOrder.fulfillment_status || null,
          financialStatus: shopifyOrder.financial_status,
          rawData: shopifyOrder as unknown as Prisma.JsonObject,
          syncedAt: new Date(),
        },
      })

      // Create new lines
      await tx.shopifyOrderLine.createMany({
        data: lineData.map((line) => ({
          orderId: existingOrder.id,
          ...line,
        })),
      })
    })
    result.ordersUpdated++
  } else {
    // Create new order
    await prisma.shopifyOrder.create({
      data: {
        connectionId,
        shopifyOrderId,
        shopifyOrderNumber: shopifyOrder.name,
        orderDate: new Date(shopifyOrder.created_at),
        fulfillmentStatus: shopifyOrder.fulfillment_status || null,
        financialStatus: shopifyOrder.financial_status,
        status: orderStatus,
        rawData: shopifyOrder as unknown as Prisma.JsonObject,
        syncedAt: new Date(),
        lines: {
          createMany: {
            data: lineData,
          },
        },
      },
    })
    result.ordersCreated++
  }
}

// Re-export types for convenience
export type { SyncResult } from '@/types/shopify-sync'
