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
  locationId: z.string().uuid('Invalid location ID').optional(),
  lotNumber: z.string().max(100).optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format').optional(),
})

export type CreateReceiptInput = z.infer<typeof createReceiptSchema>

// Adjustment transaction schema
export const createAdjustmentSchema = z.object({
  date: z.coerce.date(),
  componentId: z.string().uuid('Invalid component ID'),
  quantity: z.coerce.number().refine((val) => val !== 0, 'Quantity cannot be zero'),
  reason: z.string().min(1, 'Reason is required').max(200),
  notes: z.string().optional().nullable(),
  locationId: z.string().uuid('Invalid location ID').optional(),
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
  locationId: z.string().uuid('Invalid location ID').optional(),
})

export type CreateInitialInput = z.infer<typeof createInitialSchema>

// Transfer transaction schema
export const createTransferSchema = z.object({
  date: z.coerce.date(),
  componentId: z.string().uuid('Invalid component ID'),
  quantity: z.coerce.number().positive('Quantity must be positive'),
  fromLocationId: z.string().uuid('Invalid from location ID'),
  toLocationId: z.string().uuid('Invalid to location ID'),
  notes: z.string().optional().nullable(),
})

export type CreateTransferInput = z.infer<typeof createTransferSchema>

// Build transaction schema
export const createBuildSchema = z.object({
  date: z.coerce.date(),
  skuId: z.string().uuid('Invalid SKU ID'),
  unitsToBuild: z.coerce.number().int().positive('Units must be positive'),
  salesChannel: z.string().optional(),
  notes: z.string().optional().nullable(),
  defectCount: z.coerce.number().int().nonnegative().optional().nullable(),
  defectNotes: z.string().optional().nullable(),
  affectedUnits: z.coerce.number().int().nonnegative().optional().nullable(),
  allowInsufficientInventory: z.boolean().default(false),
  locationId: z.string().uuid('Invalid location ID').optional(),
  // Finished goods output
  outputToFinishedGoods: z.boolean().default(true),
  outputLocationId: z.string().uuid('Invalid output location ID').optional(),
  outputQuantity: z.coerce.number().int().positive().optional(),
  // Lot overrides for manual lot selection during build
  lotOverrides: z.array(z.object({
    componentId: z.string().uuid('Invalid component ID'),
    allocations: z.array(z.object({
      lotId: z.string().uuid('Invalid lot ID'),
      quantity: z.coerce.number().positive('Quantity must be positive'),
    })),
  })).optional(),
  // Allow using expired lots (override expiry enforcement)
  allowExpiredLots: z.boolean().optional(),
})

export type CreateBuildInput = z.infer<typeof createBuildSchema>

// Outbound transaction schema (shipping SKUs out of warehouse)
export const createOutboundSchema = z.object({
  date: z.coerce.date(),
  skuId: z.string().uuid('Invalid SKU ID'),
  salesChannel: z.string().min(1, 'Sales channel is required'),
  quantity: z.coerce.number().int().positive('Quantity must be positive'),
  notes: z.string().optional().nullable(),
  locationId: z.string().uuid('Invalid location ID').optional(),
})

export type CreateOutboundInput = z.infer<typeof createOutboundSchema>

// Insufficient inventory item type (matches service)
export interface InsufficientInventoryItem {
  componentId: string
  componentName: string
  skuCode: string
  required: number
  available: number
  shortage: number
}

// Lot selection for build consumption
export interface LotSelection {
  lotId: string
  quantity: number
}

// Per-component lot allocation override
export interface ComponentLotOverride {
  componentId: string
  allocations: LotSelection[]
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
  type: z.enum(['receipt', 'build', 'adjustment', 'initial', 'transfer', 'outbound']).optional(),
  componentId: z.string().uuid().optional(),
  skuId: z.string().uuid().optional(),
  salesChannel: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  locationId: z.string().uuid().optional(),
  sortBy: z.enum(['date', 'createdAt', 'type']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>

// Transaction response type
export interface TransactionResponse {
  id: string
  type: 'receipt' | 'build' | 'adjustment' | 'initial' | 'transfer' | 'outbound'
  date: string
  sku?: { id: string; name: string } | null
  bomVersion?: { id: string; versionName: string } | null
  locationId: string | null
  location?: { id: string; name: string } | null
  fromLocationId?: string | null
  fromLocation?: { id: string; name: string } | null
  toLocationId?: string | null
  toLocation?: { id: string; name: string } | null
  salesChannel: string | null
  unitsBuild: number | null
  unitBomCost: string | null
  totalBomCost: string | null
  supplier: string | null
  reason: string | null
  notes: string | null
  defectCount: number | null
  defectNotes: string | null
  affectedUnits: number | null
  createdAt: string
  createdBy: { id: string; name: string }
  lines: TransactionLineResponse[]
}

export interface TransactionLineResponse {
  id: string
  component: { id: string; name: string; skuCode: string }
  quantityChange: string
  costPerUnit: string | null
  lotId: string | null
  lot: { id: string; lotNumber: string; expiryDate: string | null } | null
}

// Transaction detail response
export interface TransactionDetailResponse extends TransactionResponse {
  company: { id: string; name: string }
  location?: { id: string; name: string; type: string } | null
}
