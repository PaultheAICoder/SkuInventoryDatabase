/**
 * Shopify Sync Service
 *
 * Orchestrates syncing orders from Shopify to local database.
 * Populates SalesDaily records for reporting.
 */

import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { fetchOrders } from './client'
import { format, subDays, parseISO } from 'date-fns'
import type { ShopifyOrderResponse } from '@/types/shopify'

interface SyncOptions {
  connectionId: string
  dateRange?: {
    startDate: string
    endDate: string
  }
  triggeredById?: string
}

interface SyncResult {
  success: boolean
  ordersProcessed: number
  ordersCreated: number
  ordersUpdated: number
  ordersFailed: number
  salesDailyUpdated: number
  errors: string[]
  durationMs: number
}

/**
 * Sync all orders from Shopify
 */
export async function syncAll(options: SyncOptions): Promise<SyncResult> {
  const startTime = Date.now()
  const errors: string[] = []
  let ordersProcessed = 0
  let ordersCreated = 0
  let ordersUpdated = 0
  let ordersFailed = 0
  let salesDailyUpdated = 0

  // Create sync log entry
  const syncLog = await prisma.syncLog.create({
    data: {
      integrationType: 'shopify',
      syncType: 'full',
      status: 'running',
      triggeredById: options.triggeredById,
      metadata: {
        dateRange: options.dateRange,
      },
    },
  })

  // Update connection status
  await prisma.shopifyConnection.update({
    where: { id: options.connectionId },
    data: { syncStatus: 'syncing' },
  })

  try {
    // Build date range filter
    const dateParams: { created_at_min?: string; created_at_max?: string } = {}
    if (options.dateRange) {
      dateParams.created_at_min = `${options.dateRange.startDate}T00:00:00Z`
      dateParams.created_at_max = `${options.dateRange.endDate}T23:59:59Z`
    } else {
      // Default to last 30 days
      dateParams.created_at_min = format(subDays(new Date(), 30), "yyyy-MM-dd'T'00:00:00'Z'")
    }

    // Fetch orders from Shopify
    const ordersResult = await fetchOrders(options.connectionId, {
      status: 'any',
      ...dateParams,
    })

    if (!ordersResult.success) {
      throw new Error(ordersResult.error.message)
    }

    const orders = ordersResult.data
    ordersProcessed = orders.length

    // Process orders in batches
    const batchSize = 50
    for (let i = 0; i < orders.length; i += batchSize) {
      const batch = orders.slice(i, i + batchSize)
      const results = await processBatch(options.connectionId, batch)

      ordersCreated += results.created
      ordersUpdated += results.updated
      ordersFailed += results.failed
      if (results.errors.length > 0) {
        errors.push(...results.errors)
      }
    }

    // Calculate and update daily sales
    const connection = await prisma.shopifyConnection.findUnique({
      where: { id: options.connectionId },
      include: { company: { include: { brands: true } } },
    })

    if (connection) {
      const brand = connection.company.brands[0] // Use primary brand
      if (brand) {
        salesDailyUpdated = await calculateDailySales(
          connection.id,
          brand.id,
          options.dateRange?.startDate,
          options.dateRange?.endDate
        )
      }
    }

    // Update sync log
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: errors.length > 0 ? 'partial' : 'completed',
        completedAt: new Date(),
        recordsProcessed: ordersProcessed,
        recordsCreated: ordersCreated,
        recordsUpdated: ordersUpdated,
        recordsFailed: ordersFailed,
        errorMessage: errors.length > 0 ? errors.slice(0, 5).join('; ') : null,
      },
    })

    // Update connection status
    await prisma.shopifyConnection.update({
      where: { id: options.connectionId },
      data: {
        syncStatus: 'idle',
        lastSyncAt: new Date(),
      },
    })

    return {
      success: errors.length === 0,
      ordersProcessed,
      ordersCreated,
      ordersUpdated,
      ordersFailed,
      salesDailyUpdated,
      errors,
      durationMs: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Sync failed'
    errors.push(errorMessage)

    // Update sync log with error
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorMessage,
      },
    })

    // Update connection status
    await prisma.shopifyConnection.update({
      where: { id: options.connectionId },
      data: { syncStatus: 'error' },
    })

    // Create notification
    const connection = await prisma.shopifyConnection.findUnique({
      where: { id: options.connectionId },
      include: { company: { include: { userCompanies: true } } },
    })

    if (connection) {
      const adminUsers = connection.company.userCompanies.filter(uc => uc.role === 'admin')
      for (const uc of adminUsers) {
        await prisma.notification.create({
          data: {
            userId: uc.userId,
            type: 'error',
            title: 'Shopify Sync Failed',
            message: errorMessage,
            relatedType: 'sync_log',
            relatedId: syncLog.id,
          },
        })
      }
    }

    return {
      success: false,
      ordersProcessed,
      ordersCreated,
      ordersUpdated,
      ordersFailed,
      salesDailyUpdated,
      errors,
      durationMs: Date.now() - startTime,
    }
  }
}

/**
 * Process a batch of orders
 */
async function processBatch(
  connectionId: string,
  orders: ShopifyOrderResponse[]
): Promise<{ created: number; updated: number; failed: number; errors: string[] }> {
  let created = 0
  let updated = 0
  let failed = 0
  const errors: string[] = []

  for (const order of orders) {
    try {
      // Check if order already exists
      const existing = await prisma.shopifyOrder.findFirst({
        where: {
          connectionId,
          shopifyOrderId: order.id.toString(),
        },
      })

      const orderData = {
        shopifyOrderId: order.id.toString(),
        shopifyOrderNumber: order.order_number.toString(),
        orderDate: parseISO(order.created_at),
        financialStatus: order.financial_status || null,
        fulfillmentStatus: order.fulfillment_status || null,
        rawData: order as unknown as Prisma.InputJsonValue,
      }

      if (existing) {
        await prisma.shopifyOrder.update({
          where: { id: existing.id },
          data: orderData,
        })
        updated++
      } else {
        await prisma.shopifyOrder.create({
          data: {
            connectionId,
            ...orderData,
          },
        })
        created++
      }

      // Also process and store line items
      const shopifyOrderRecord = existing || await prisma.shopifyOrder.findFirst({
        where: { connectionId, shopifyOrderId: order.id.toString() }
      })

      if (shopifyOrderRecord) {
        // Delete existing line items and recreate
        await prisma.shopifyOrderLine.deleteMany({
          where: { orderId: shopifyOrderRecord.id }
        })

        // Create line items
        for (const lineItem of order.line_items) {
          await prisma.shopifyOrderLine.create({
            data: {
              orderId: shopifyOrderRecord.id,
              shopifyLineId: lineItem.id.toString(),
              shopifyVariantId: lineItem.variant_id?.toString() || null,
              shopifySku: lineItem.sku || null,
              title: lineItem.title,
              quantity: lineItem.quantity,
              price: parseFloat(lineItem.price),
            }
          })
        }
      }
    } catch (error) {
      failed++
      errors.push(`Order ${order.id}: ${error instanceof Error ? error.message : 'Processing error'}`)
    }
  }

  return { created, updated, failed, errors }
}

/**
 * Calculate daily sales from synced orders
 */
async function calculateDailySales(
  connectionId: string,
  brandId: string,
  startDate?: string,
  endDate?: string
): Promise<number> {
  // Get orders grouped by date with their line items
  const dateFilter: { gte?: Date; lte?: Date } = {}
  if (startDate) dateFilter.gte = parseISO(startDate)
  if (endDate) dateFilter.lte = parseISO(endDate)

  const orders = await prisma.shopifyOrder.findMany({
    where: {
      connectionId,
      orderDate: Object.keys(dateFilter).length > 0 ? dateFilter : undefined,
    },
    include: {
      lines: true,
    },
  })

  // Aggregate by date
  const dailyTotals = new Map<string, { total: number; count: number }>()

  for (const order of orders) {
    const dateKey = format(order.orderDate, 'yyyy-MM-dd')
    // Calculate order total from line items
    const orderTotal = order.lines.reduce((sum, line) => {
      return sum + (Number(line.price) * line.quantity)
    }, 0)

    const current = dailyTotals.get(dateKey) || { total: 0, count: 0 }
    dailyTotals.set(dateKey, {
      total: current.total + orderTotal,
      count: current.count + 1,
    })
  }

  // Upsert SalesDaily records
  let updated = 0
  const dailyEntries = Array.from(dailyTotals.entries())
  for (const [dateKey, { total: totalSales, count: orderCount }] of dailyEntries) {
    const date = parseISO(dateKey)

    // Get ad-attributed sales from KeywordMetric for this date
    const adMetrics = await prisma.keywordMetric.aggregate({
      where: {
        date,
      },
      _sum: {
        sales: true,
      },
    })

    const adAttributed = Number(adMetrics._sum.sales) || 0
    const organic = Math.max(0, totalSales - adAttributed)

    // Upsert SalesDaily record
    const existing = await prisma.salesDaily.findFirst({
      where: {
        brandId,
        date,
        channel: 'shopify',
      },
    })

    if (existing) {
      await prisma.salesDaily.update({
        where: { id: existing.id },
        data: {
          totalSales,
          adAttributedSales: adAttributed,
          organicSales: organic,
          unitsTotal: orderCount,
        },
      })
    } else {
      await prisma.salesDaily.create({
        data: {
          brandId,
          date,
          channel: 'shopify',
          totalSales,
          adAttributedSales: adAttributed,
          organicSales: organic,
          unitsTotal: orderCount,
        },
      })
    }

    updated++
  }

  return updated
}
