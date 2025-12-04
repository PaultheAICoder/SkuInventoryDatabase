/**
 * Order posting types and Zod schemas
 * Used for posting approved orders to create inventory transactions
 */

import { z } from 'zod'
import type { InsufficientInventoryItem } from '@/services/inventory'

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Schema for posting a single order
 */
export const postOrderSchema = z.object({
  allowInsufficientInventory: z.boolean().optional().default(false),
})

export type PostOrderInput = z.infer<typeof postOrderSchema>

/**
 * Schema for batch posting orders
 */
export const postOrderBatchSchema = z.object({
  orderIds: z.array(z.string().uuid()).min(1, 'At least one order ID required'),
  allowInsufficientInventory: z.boolean().optional().default(false),
})

export type PostOrderBatchInput = z.infer<typeof postOrderBatchSchema>

// =============================================================================
// Response Types
// =============================================================================

/**
 * Error during posting
 */
export interface PostingError {
  skuId?: string
  skuName?: string
  message: string
  code: 'NO_BOM' | 'INSUFFICIENT_INVENTORY' | 'TRANSACTION_FAILED' | 'VALIDATION_ERROR'
}

/**
 * Result of posting a single order
 */
export interface PostOrderResult {
  success: boolean
  orderId: string
  transactionIds: string[]
  errors: PostingError[]
  insufficientInventory: InsufficientInventoryItem[]
  warnings: string[]
  skusSummary: Array<{
    skuId: string
    skuName: string
    internalCode: string
    totalUnits: number
    transactionId: string
  }>
}

/**
 * Result of batch posting
 */
export interface PostOrderBatchResult {
  totalOrders: number
  successCount: number
  failureCount: number
  results: Array<{
    orderId: string
    shopifyOrderNumber: string
    result: PostOrderResult
  }>
}
