import { z } from 'zod'

// Expiry status type
export type ExpiryStatus = 'ok' | 'expiring_soon' | 'expired'

// Lot list query schema
export const lotListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
  search: z.string().optional(),
  componentId: z.string().uuid().optional(),
  expiryDateFrom: z.string().optional(),
  expiryDateTo: z.string().optional(),
  status: z.enum(['ok', 'expiring_soon', 'expired']).optional(),
  sortBy: z.enum(['lotNumber', 'expiryDate', 'balance', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export type LotListQuery = z.infer<typeof lotListQuerySchema>

// Lot response type (what API returns for list)
export interface LotResponse {
  id: string
  lotNumber: string
  componentId: string
  componentName: string
  componentSkuCode: string
  expiryDate: string | null
  receivedQuantity: string
  balance: string
  supplier: string | null
  status: ExpiryStatus
  notes: string | null
  createdAt: string
}

// Lot detail response (extends LotResponse with additional data)
export interface LotDetailResponse extends LotResponse {
  updatedAt: string
}

// Lot transaction response (for trace API)
export interface LotTransactionResponse {
  id: string
  date: string
  type: string
  quantityChange: string
  skuId: string | null
  skuName: string | null
  skuInternalCode: string | null
  locationId: string | null
  locationName: string | null
  createdById: string
  createdByName: string
  notes: string | null
}

// Affected SKU response (for trace API - SKUs built using this lot)
export interface AffectedSkuResponse {
  id: string
  name: string
  internalCode: string
  quantityUsed: string
  transactionCount: number
}

// Trace API response
export interface LotTraceResponse {
  transactions: LotTransactionResponse[]
  affectedSkus: AffectedSkuResponse[]
  totalTransactions: number
}
