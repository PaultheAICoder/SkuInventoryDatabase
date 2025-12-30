/**
 * [V2-DEFERRED] Shopify Sync Types
 * Moved from src/types/shopify-sync.ts on 2025-12-06
 * Reason: PRD V1 explicitly excludes integrations
 * Restore: Move back to src/types/ when V2 work begins
 */

/**
 * Shopify sync types and Zod schemas
 * Used for order sync trigger requests and order list queries
 */

import { z } from 'zod'

// =============================================================================
// Sync Request Schemas
// =============================================================================

/**
 * Schema for sync trigger request
 * Validates date ranges and fullSync flag
 */
export const syncRequestSchema = z.object({
  createdAtMin: z.string().datetime().optional(),
  createdAtMax: z.string().datetime().optional(),
  fullSync: z.boolean().optional().default(false),
})

export type SyncRequestInput = z.infer<typeof syncRequestSchema>

// =============================================================================
// Order List Query Schema
// =============================================================================

/**
 * Schema for order list query parameters
 * Validates pagination, status filter, search, and hasUnmappedLines filter
 */
export const orderListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
  status: z.enum(['pending', 'approved', 'posted', 'skipped', 'error']).optional(),
  search: z.string().optional(),
  hasUnmappedLines: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
})

export type OrderListQuery = z.infer<typeof orderListQuerySchema>

// =============================================================================
// Response Interfaces
// =============================================================================

/**
 * Result of a sync operation
 */
export interface SyncResult {
  ordersProcessed: number
  ordersCreated: number
  ordersUpdated: number
  linesProcessed: number
  linesMapped: number
  linesUnmapped: number
  errors: Array<{ orderId: string; error: string }>
  syncDuration: number // milliseconds
}

/**
 * Order response for API endpoints
 */
export interface OrderResponse {
  id: string
  shopifyOrderId: string
  shopifyOrderNumber: string
  orderDate: string
  fulfillmentStatus: string | null
  financialStatus: string | null
  status: 'pending' | 'approved' | 'posted' | 'skipped' | 'error'
  errorMessage: string | null
  syncedAt: string
  processedAt: string | null
  hasUnmappedLines: boolean
  lines: OrderLineResponse[]
}

/**
 * Order line response for API endpoints
 */
export interface OrderLineResponse {
  id: string
  shopifyLineId: string
  shopifyVariantId: string | null
  shopifySku: string | null
  title: string
  quantity: number
  price: string
  mappedSkuId: string | null
  mappedSku: { id: string; name: string; internalCode: string } | null
  mappingStatus: 'mapped' | 'unmapped' | 'not_found'
}
