import { z } from 'zod'

// Receipt transaction schema
export const createReceiptSchema = z.object({
  date: z.coerce.date(),
  componentId: z.string().uuid('Invalid component ID'),
  quantity: z.coerce.number().positive('Quantity must be positive'),
  supplier: z.string().min(1, 'Supplier is required').max(100),
  costPerUnit: z.coerce.number().nonnegative().optional(),
  updateComponentCost: z.boolean().default(false),
  notes: z.string().optional().nullable(),
})

export type CreateReceiptInput = z.infer<typeof createReceiptSchema>

// Adjustment transaction schema
export const createAdjustmentSchema = z.object({
  date: z.coerce.date(),
  componentId: z.string().uuid('Invalid component ID'),
  quantity: z.coerce.number().refine((val) => val !== 0, 'Quantity cannot be zero'),
  reason: z.string().min(1, 'Reason is required').max(200),
  notes: z.string().optional().nullable(),
})

export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>

// Initial transaction schema (opening balance)
export const createInitialSchema = z.object({
  date: z.coerce.date(),
  componentId: z.string().uuid('Invalid component ID'),
  quantity: z.coerce.number().positive('Quantity must be positive'),
  costPerUnit: z.coerce.number().nonnegative().optional(),
  updateComponentCost: z.boolean().default(false),
  notes: z.string().optional().nullable(),
})

export type CreateInitialInput = z.infer<typeof createInitialSchema>

// Build transaction schema
export const createBuildSchema = z.object({
  date: z.coerce.date(),
  skuId: z.string().uuid('Invalid SKU ID'),
  unitsToBuild: z.coerce.number().int().positive('Units must be positive'),
  salesChannel: z.string().optional(),
  notes: z.string().optional().nullable(),
  allowInsufficientInventory: z.boolean().default(false),
})

export type CreateBuildInput = z.infer<typeof createBuildSchema>

// Insufficient inventory item type (matches service)
export interface InsufficientInventoryItem {
  componentId: string
  componentName: string
  skuCode: string
  required: number
  available: number
  shortage: number
}

// Build transaction response includes warning info
export interface BuildTransactionResponse {
  transaction: TransactionResponse
  insufficientItems: InsufficientInventoryItem[]
  warning: boolean
}

// Transaction list query schema
export const transactionListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
  type: z.enum(['receipt', 'build', 'adjustment', 'initial']).optional(),
  componentId: z.string().uuid().optional(),
  skuId: z.string().uuid().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  sortBy: z.enum(['date', 'createdAt', 'type']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>

// Transaction response type
export interface TransactionResponse {
  id: string
  type: 'receipt' | 'build' | 'adjustment' | 'initial'
  date: string
  sku?: { id: string; name: string } | null
  bomVersion?: { id: string; versionName: string } | null
  salesChannel: string | null
  unitsBuild: number | null
  unitBomCost: string | null
  totalBomCost: string | null
  supplier: string | null
  reason: string | null
  notes: string | null
  createdAt: string
  createdBy: { id: string; name: string }
  lines: TransactionLineResponse[]
}

export interface TransactionLineResponse {
  id: string
  component: { id: string; name: string; skuCode: string }
  quantityChange: string
  costPerUnit: string | null
}

// Transaction detail response
export interface TransactionDetailResponse extends TransactionResponse {
  company: { id: string; name: string }
}
