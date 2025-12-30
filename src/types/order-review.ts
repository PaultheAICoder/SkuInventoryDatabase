/**
 * [V2-DEFERRED] Order Review Types
 * Moved from src/types/order-review.ts on 2025-12-06
 * Reason: PRD V1 explicitly excludes integrations
 * Restore: Move back to src/types/ when V2 work begins
 */

/**
 * Order Review Queue types and Zod schemas
 * Used for order review UI actions: mapping, approve, skip
 */

import { z } from 'zod'

// =============================================================================
// Line Mapping Schemas
// =============================================================================

/**
 * Schema for updating a line item's SKU mapping
 */
export const updateLineMappingSchema = z.object({
  mappedSkuId: z.string().uuid(),
})

export type UpdateLineMappingInput = z.infer<typeof updateLineMappingSchema>

// =============================================================================
// Order Action Schemas
// =============================================================================

/**
 * Schema for approving an order
 * No body required - validation happens server-side
 */
export const approveOrderSchema = z.object({})

/**
 * Schema for skipping an order
 */
export const skipOrderSchema = z.object({
  reason: z.string().max(500).optional(),
})

export type SkipOrderInput = z.infer<typeof skipOrderSchema>

// =============================================================================
// Status Configuration
// =============================================================================

/**
 * Order status badge configuration mapping
 * Used for consistent display across UI components
 */
export const ORDER_STATUS_CONFIG = {
  pending: { label: 'Pending', variant: 'warning' as const },
  approved: { label: 'Approved', variant: 'default' as const },
  posted: { label: 'Posted', variant: 'success' as const },
  skipped: { label: 'Skipped', variant: 'secondary' as const },
  error: { label: 'Error', variant: 'critical' as const },
} as const

export type OrderStatusKey = keyof typeof ORDER_STATUS_CONFIG
