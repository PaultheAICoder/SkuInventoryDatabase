/**
 * Amazon SP-API Order Sync Service
 *
 * Orchestrates fetching orders from Amazon SP-API and populating
 * SalesDaily records with total sales data by ASIN.
 */

import { prisma } from '@/lib/db'
import { format, parseISO, startOfDay } from 'date-fns'
import { getOrders, getOrderItems, isCompletedOrder } from './orders'
import type { GetOrdersOptions, OrderSyncResult } from './types'

// ============================================
// Types
// ============================================

export interface OrderSyncOptions {
  credentialId: string
  brandId: string
  dateRange: {
    startDate: string  // ISO date
    endDate: string    // ISO date
  }
  triggeredById?: string
}

interface DailyAsinAggregate {
  totalSales: number
  unitCount: number
}

// ============================================
// Main Sync Function
// ============================================

/**
 * Sync orders from Amazon SP-API to SalesDaily
 */
export async function syncOrders(options: OrderSyncOptions): Promise<OrderSyncResult> {
  const startTime = Date.now()
  const errors: string[] = []
  let ordersProcessed = 0
  let orderItemsProcessed = 0
  let salesDailyUpdated = 0

  // Create sync log entry
  const syncLog = await prisma.syncLog.create({
    data: {
      credentialId: options.credentialId,
      integrationType: 'amazon_sp',
      syncType: 'manual',
      status: 'running',
      triggeredById: options.triggeredById,
      metadata: {
        dateRange: options.dateRange,
        brandId: options.brandId,
      },
    },
  })

  try {
    // Verify credential is active
    const credential = await prisma.integrationCredential.findUnique({
      where: { id: options.credentialId },
    })

    if (!credential || credential.status !== 'active') {
      throw new Error('Credential not found or not active')
    }

    // Fetch orders for date range
    const orderOptions: GetOrdersOptions = {
      createdAfter: `${options.dateRange.startDate}T00:00:00Z`,
      createdBefore: `${options.dateRange.endDate}T23:59:59Z`,
      orderStatuses: ['Shipped', 'PartiallyShipped'],
    }

    const ordersResult = await getOrders(options.credentialId, orderOptions)

    if (!ordersResult.success || !ordersResult.data) {
      throw new Error(ordersResult.error?.message || 'Failed to fetch orders')
    }

    const orders = ordersResult.data.filter(isCompletedOrder)
    ordersProcessed = orders.length

    console.log(`[SP-API Sync] Processing ${orders.length} completed orders`)

    // Aggregate sales by date and ASIN
    const dailyAsinMap = new Map<string, DailyAsinAggregate>()

    for (const order of orders) {
      // Fetch order items for each order
      const itemsResult = await getOrderItems(options.credentialId, order.AmazonOrderId)

      if (!itemsResult.success || !itemsResult.data) {
        errors.push(`Order ${order.AmazonOrderId}: ${itemsResult.error?.message}`)
        continue
      }

      const items = itemsResult.data
      orderItemsProcessed += items.length

      // Extract date from order
      const orderDate = startOfDay(parseISO(order.PurchaseDate))
      const dateKey = format(orderDate, 'yyyy-MM-dd')

      // Aggregate by ASIN
      for (const item of items) {
        const asin = item.ASIN
        const key = `${dateKey}:${asin}`

        const current = dailyAsinMap.get(key) || { totalSales: 0, unitCount: 0 }

        // Parse item price (may be null for pending orders, but we filter to Shipped)
        const itemPrice = item.ItemPrice?.Amount
          ? parseFloat(item.ItemPrice.Amount) * item.QuantityShipped
          : 0

        dailyAsinMap.set(key, {
          totalSales: current.totalSales + itemPrice,
          unitCount: current.unitCount + item.QuantityShipped,
        })
      }
    }

    console.log(`[SP-API Sync] Aggregated ${dailyAsinMap.size} daily ASIN records`)

    // Upsert to SalesDaily
    const dailyEntries = Array.from(dailyAsinMap.entries())
    for (const [key, data] of dailyEntries) {
      const [dateKey, asin] = key.split(':')
      const date = parseISO(dateKey)

      try {
        // Find existing record
        const existing = await prisma.salesDaily.findFirst({
          where: {
            brandId: options.brandId,
            date,
            asin,
            channel: 'amazon',
          },
        })

        if (existing) {
          // Update existing - add to totalSales, keep ad attribution separate
          await prisma.salesDaily.update({
            where: { id: existing.id },
            data: {
              totalSales: data.totalSales,
              // Organic = total - adAttributed (existing ads data preserved)
              organicSales: Math.max(0, data.totalSales - Number(existing.adAttributedSales)),
              unitsTotal: data.unitCount,
            },
          })
        } else {
          // Create new record
          await prisma.salesDaily.create({
            data: {
              brandId: options.brandId,
              date,
              asin,
              channel: 'amazon',
              totalSales: data.totalSales,
              adAttributedSales: 0,  // Will be populated by ads sync
              organicSales: data.totalSales,  // Initially all organic
              unitsTotal: data.unitCount,
              unitsAdAttributed: 0,
              unitsOrganic: data.unitCount,
            },
          })
        }

        salesDailyUpdated++
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error'
        errors.push(`SalesDaily upsert ${dateKey}:${asin}: ${errMsg}`)
      }
    }

    // Update sync log with success
    const status = errors.length > 0 ? 'partial' : 'completed'
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status,
        completedAt: new Date(),
        recordsProcessed: ordersProcessed,
        recordsCreated: salesDailyUpdated,
        recordsUpdated: 0,
        recordsFailed: errors.length,
        errorMessage: errors.length > 0 ? errors.slice(0, 5).join('; ') : null,
        errorDetails: { errors },
      },
    })

    // Update credential last used
    await prisma.integrationCredential.update({
      where: { id: options.credentialId },
      data: {
        lastUsedAt: new Date(),
        lastError: null,
        lastErrorAt: null,
      },
    })

    return {
      syncLogId: syncLog.id,
      status,
      ordersProcessed,
      orderItemsProcessed,
      salesDailyUpdated,
      errors,
      duration: Date.now() - startTime,
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Sync failed'
    errors.push(errorMessage)

    // Update sync log with failure
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        recordsProcessed: ordersProcessed,
        errorMessage,
        errorDetails: { errors },
      },
    })

    // Update credential with error
    await prisma.integrationCredential.update({
      where: { id: options.credentialId },
      data: {
        lastErrorAt: new Date(),
        lastError: errorMessage,
      },
    })

    // Create notification for sync failure
    const credential = await prisma.integrationCredential.findUnique({
      where: { id: options.credentialId },
      include: {
        company: {
          include: {
            userCompanies: {
              where: { role: 'admin' },
              select: { userId: true },
            },
          },
        },
      },
    })

    if (credential?.company?.userCompanies) {
      for (const uc of credential.company.userCompanies) {
        await prisma.notification.create({
          data: {
            userId: uc.userId,
            type: 'sync_failure',
            title: 'Amazon Orders Sync Failed',
            message: `Sync failed: ${errorMessage}`,
            relatedType: 'sync_log',
            relatedId: syncLog.id,
          },
        })
      }
    }

    return {
      syncLogId: syncLog.id,
      status: 'failed',
      ordersProcessed,
      orderItemsProcessed,
      salesDailyUpdated,
      errors,
      duration: Date.now() - startTime,
    }
  }
}
