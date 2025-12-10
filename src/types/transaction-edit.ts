import { z } from 'zod'
import { dateSchema } from './index'

// =============================================================================
// Update Transaction Schemas
// =============================================================================

/**
 * Base update schema for common fields across all transaction types
 */
export const updateTransactionBaseSchema = z.object({
  date: dateSchema.optional(),
  notes: z.string().optional().nullable(),
  locationId: z.string().uuid('Invalid location ID').optional(),
})

/**
 * Receipt transaction update schema
 */
export const updateReceiptSchema = updateTransactionBaseSchema.extend({
  componentId: z.string().uuid('Invalid component ID'),
  quantity: z.coerce.number().positive('Quantity must be positive'),
  supplier: z.string().min(1, 'Supplier is required').max(100),
  costPerUnit: z.coerce.number().nonnegative().optional(),
  lotNumber: z.string().max(100).optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format').optional(),
})

export type UpdateReceiptInput = z.infer<typeof updateReceiptSchema>

/**
 * Adjustment transaction update schema
 */
export const updateAdjustmentSchema = updateTransactionBaseSchema.extend({
  componentId: z.string().uuid('Invalid component ID'),
  quantity: z.coerce.number().refine((val) => val !== 0, 'Quantity cannot be zero'),
  reason: z.string().min(1, 'Reason is required').max(200),
})

export type UpdateAdjustmentInput = z.infer<typeof updateAdjustmentSchema>

/**
 * Initial transaction update schema
 */
export const updateInitialSchema = updateTransactionBaseSchema.extend({
  componentId: z.string().uuid('Invalid component ID'),
  quantity: z.coerce.number().positive('Quantity must be positive'),
  costPerUnit: z.coerce.number().nonnegative().optional(),
})

export type UpdateInitialInput = z.infer<typeof updateInitialSchema>

/**
 * Transfer transaction update schema
 */
export const updateTransferSchema = z.object({
  date: dateSchema.optional(),
  notes: z.string().optional().nullable(),
  componentId: z.string().uuid('Invalid component ID'),
  quantity: z.coerce.number().positive('Quantity must be positive'),
  fromLocationId: z.string().uuid('Invalid from location ID'),
  toLocationId: z.string().uuid('Invalid to location ID'),
})

export type UpdateTransferInput = z.infer<typeof updateTransferSchema>

/**
 * Build transaction update schema
 */
export const updateBuildSchema = updateTransactionBaseSchema.extend({
  unitsToBuild: z.coerce.number().int().positive('Units must be positive'),
  salesChannel: z.string().optional(),
  defectCount: z.coerce.number().int().nonnegative().optional().nullable(),
  defectNotes: z.string().optional().nullable(),
  affectedUnits: z.coerce.number().int().nonnegative().optional().nullable(),
  allowInsufficientInventory: z.boolean().default(false),
})

export type UpdateBuildInput = z.infer<typeof updateBuildSchema>

/**
 * Outbound transaction update schema
 */
export const updateOutboundSchema = updateTransactionBaseSchema.extend({
  skuId: z.string().uuid('Invalid SKU ID'),
  salesChannel: z.string().min(1, 'Sales channel is required'),
  quantity: z.coerce.number().int().positive('Quantity must be positive'),
})

export type UpdateOutboundInput = z.infer<typeof updateOutboundSchema>

// =============================================================================
// Transaction Edit Result Types
// =============================================================================

/**
 * Result type for transaction update operations
 */
export interface TransactionUpdateResult {
  id: string
  type: string
  date: Date
  updatedAt: Date
}

/**
 * Result type for transaction delete operations
 */
export interface TransactionDeleteResult {
  id: string
  type: string
  deleted: boolean
}
