/**
 * [V2-DEFERRED] Order Posting Service
 * Moved from src/services/order-posting.ts on 2025-12-06
 * Reason: PRD V1 explicitly excludes integrations
 * Restore: Move back to src/services/ when V2 work begins
 */

/**
 * Order Posting Service
 * Handles converting approved Shopify orders into inventory transactions
 */

import { prisma } from '@/lib/db'
import { createBuildTransaction, getCompanySettings, checkInsufficientInventory } from './inventory'
import type { PostOrderResult, PostingError } from '@/types/order-posting'
import type { InsufficientInventoryItem } from './inventory'
import { toLocalDateString } from '@/lib/utils'

/**
 * Aggregated SKU line item from order
 */
interface AggregatedSku {
  skuId: string
  skuName: string
  internalCode: string
  totalQuantity: number
  lineIds: string[]
}

/**
 * Get effective BOM version for a SKU at a specific date
 * Returns the BOM version that was active on that date
 */
async function getEffectiveBomVersion(
  skuId: string,
  orderDate: Date
): Promise<{
  id: string
  versionName: string
} | null> {
  const bomVersion = await prisma.bOMVersion.findFirst({
    where: {
      skuId,
      effectiveStartDate: { lte: orderDate },
      OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: orderDate } }],
    },
    orderBy: { effectiveStartDate: 'desc' },
    select: {
      id: true,
      versionName: true,
    },
  })

  return bomVersion
}

/**
 * Aggregate order lines by SKU
 * Groups quantities for the same SKU across multiple lines
 */
function aggregateLinesBySku(
  lines: Array<{
    id: string
    mappedSkuId: string | null
    mappingStatus: string
    quantity: number
  }>,
  skuMap: Map<string, { name: string; internalCode: string }>
): AggregatedSku[] {
  const aggregated = new Map<string, AggregatedSku>()

  for (const line of lines) {
    // Skip unmapped or ignored lines
    if (!line.mappedSkuId || line.mappingStatus !== 'mapped') {
      continue
    }

    const existing = aggregated.get(line.mappedSkuId)
    const skuInfo = skuMap.get(line.mappedSkuId)

    if (existing) {
      existing.totalQuantity += line.quantity
      existing.lineIds.push(line.id)
    } else {
      aggregated.set(line.mappedSkuId, {
        skuId: line.mappedSkuId,
        skuName: skuInfo?.name ?? 'Unknown',
        internalCode: skuInfo?.internalCode ?? 'Unknown',
        totalQuantity: line.quantity,
        lineIds: [line.id],
      })
    }
  }

  return Array.from(aggregated.values())
}

/**
 * Post a single approved Shopify order to create inventory transactions
 *
 * Flow:
 * 1. Validate order exists and is in "approved" status
 * 2. Get all mapped line items
 * 3. Aggregate quantities by SKU
 * 4. For each SKU, find effective BOM and create build transaction
 * 5. Update order status to "posted"
 */
export async function postShopifyOrder(params: {
  orderId: string
  userId: string
  companyId: string
  allowInsufficientInventory?: boolean
}): Promise<PostOrderResult> {
  const { orderId, userId, companyId, allowInsufficientInventory = false } = params

  const result: PostOrderResult = {
    success: false,
    orderId,
    transactionIds: [],
    errors: [],
    insufficientInventory: [],
    warnings: [],
    skusSummary: [],
  }

  // Get order with lines and validate
  const order = await prisma.shopifyOrder.findFirst({
    where: {
      id: orderId,
      connection: { companyId },
    },
    include: {
      lines: {
        select: {
          id: true,
          mappedSkuId: true,
          mappingStatus: true,
          quantity: true,
        },
      },
    },
  })

  if (!order) {
    result.errors.push({
      message: 'Order not found',
      code: 'VALIDATION_ERROR',
    })
    return result
  }

  // Check idempotency - if already posted, return existing state
  if (order.status === 'posted') {
    result.errors.push({
      message: 'Order already posted',
      code: 'VALIDATION_ERROR',
    })
    return result
  }

  // Validate order is approved
  if (order.status !== 'approved') {
    result.errors.push({
      message: `Order must be approved before posting (current status: ${order.status})`,
      code: 'VALIDATION_ERROR',
    })
    return result
  }

  // Get SKU details for mapped lines
  const mappedSkuIds = order.lines
    .filter((l) => l.mappedSkuId && l.mappingStatus === 'mapped')
    .map((l) => l.mappedSkuId!)

  if (mappedSkuIds.length === 0) {
    result.errors.push({
      message: 'No mapped SKUs found in order',
      code: 'VALIDATION_ERROR',
    })
    return result
  }

  const skus = await prisma.sKU.findMany({
    where: { id: { in: mappedSkuIds } },
    select: { id: true, name: true, internalCode: true },
  })

  const skuMap = new Map(skus.map((s) => [s.id, { name: s.name, internalCode: s.internalCode }]))

  // Aggregate lines by SKU
  const aggregatedSkus = aggregateLinesBySku(order.lines, skuMap)

  if (aggregatedSkus.length === 0) {
    result.errors.push({
      message: 'No mapped lines to process',
      code: 'VALIDATION_ERROR',
    })
    return result
  }

  // Get company settings
  const settings = await getCompanySettings(companyId)
  const allowInsufficient = settings.allowNegativeInventory || allowInsufficientInventory

  // Pre-check all SKUs for BOM availability and inventory
  const preCheckErrors: PostingError[] = []
  const allInsufficientItems: InsufficientInventoryItem[] = []

  for (const sku of aggregatedSkus) {
    const bomVersion = await getEffectiveBomVersion(sku.skuId, order.orderDate)

    if (!bomVersion) {
      preCheckErrors.push({
        skuId: sku.skuId,
        skuName: sku.skuName,
        message: `No BOM version effective on ${toLocalDateString(order.orderDate)}`,
        code: 'NO_BOM',
      })
      continue
    }

    // Check inventory if not allowing insufficient
    if (!allowInsufficient) {
      const insufficientItems = await checkInsufficientInventory({
        bomVersionId: bomVersion.id,
        companyId,
        unitsToBuild: sku.totalQuantity,
      })

      if (insufficientItems.length > 0) {
        allInsufficientItems.push(...insufficientItems)
        preCheckErrors.push({
          skuId: sku.skuId,
          skuName: sku.skuName,
          message: `Insufficient inventory for ${insufficientItems.length} component(s)`,
          code: 'INSUFFICIENT_INVENTORY',
        })
      }
    }
  }

  // If pre-check found errors and we're not allowing insufficient inventory, return early
  if (preCheckErrors.length > 0 && !allowInsufficient) {
    result.errors = preCheckErrors
    result.insufficientInventory = allInsufficientItems
    return result
  }

  // Process all SKUs in a database transaction
  try {
    await prisma.$transaction(async (tx) => {
      for (const sku of aggregatedSkus) {
        const bomVersion = await getEffectiveBomVersion(sku.skuId, order.orderDate)

        if (!bomVersion) {
          // Skip SKUs without BOM (already warned in pre-check)
          result.warnings.push(`Skipped ${sku.skuName}: No effective BOM`)
          continue
        }

        try {
          // Create build transaction with source reference
          const buildResult = await createBuildTransaction({
            companyId,
            skuId: sku.skuId,
            bomVersionId: bomVersion.id,
            unitsToBuild: sku.totalQuantity,
            salesChannel: 'shopify',
            date: order.orderDate,
            notes: `Shopify Order #${order.shopifyOrderNumber}`,
            createdById: userId,
            allowInsufficientInventory: allowInsufficient,
          })

          // Update the transaction with source reference
          await tx.transaction.update({
            where: { id: buildResult.transaction.id },
            data: {
              sourceType: 'shopify',
              sourceOrderId: orderId,
            },
          })

          result.transactionIds.push(buildResult.transaction.id)
          result.skusSummary.push({
            skuId: sku.skuId,
            skuName: sku.skuName,
            internalCode: sku.internalCode,
            totalUnits: sku.totalQuantity,
            transactionId: buildResult.transaction.id,
          })

          if (buildResult.warning) {
            result.warnings.push(`${sku.skuName}: Built with insufficient inventory warning`)
            result.insufficientInventory.push(...buildResult.insufficientItems)
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          result.errors.push({
            skuId: sku.skuId,
            skuName: sku.skuName,
            message: errorMessage,
            code: 'TRANSACTION_FAILED',
          })
        }
      }

      // Only update order status if at least one transaction succeeded
      if (result.transactionIds.length > 0) {
        await tx.shopifyOrder.update({
          where: { id: orderId },
          data: {
            status: 'posted',
            processedAt: new Date(),
            transactionId: result.transactionIds[0], // Store primary transaction ID
          },
        })
      }
    })

    result.success = result.transactionIds.length > 0 && result.errors.length === 0
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Transaction rollback'
    result.errors.push({
      message: errorMessage,
      code: 'TRANSACTION_FAILED',
    })
  }

  return result
}

/**
 * Post multiple approved orders in batch
 */
export async function postShopifyOrderBatch(params: {
  orderIds: string[]
  userId: string
  companyId: string
  allowInsufficientInventory?: boolean
}): Promise<{
  totalOrders: number
  successCount: number
  failureCount: number
  results: Array<{
    orderId: string
    shopifyOrderNumber: string
    result: PostOrderResult
  }>
}> {
  const { orderIds, userId, companyId, allowInsufficientInventory } = params

  // Get order numbers for response
  const orders = await prisma.shopifyOrder.findMany({
    where: {
      id: { in: orderIds },
      connection: { companyId },
    },
    select: {
      id: true,
      shopifyOrderNumber: true,
    },
  })

  const orderNumberMap = new Map(orders.map((o) => [o.id, o.shopifyOrderNumber]))

  const results: Array<{
    orderId: string
    shopifyOrderNumber: string
    result: PostOrderResult
  }> = []

  let successCount = 0
  let failureCount = 0

  // Process orders sequentially to avoid race conditions
  for (const orderId of orderIds) {
    const result = await postShopifyOrder({
      orderId,
      userId,
      companyId,
      allowInsufficientInventory,
    })

    results.push({
      orderId,
      shopifyOrderNumber: orderNumberMap.get(orderId) ?? 'Unknown',
      result,
    })

    if (result.success) {
      successCount++
    } else {
      failureCount++
    }
  }

  return {
    totalOrders: orderIds.length,
    successCount,
    failureCount,
    results,
  }
}
