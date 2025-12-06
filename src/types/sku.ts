import { z } from 'zod'
import { salesChannelSchema } from './index'
import type { SkuInventorySummary } from './finished-goods'

// BOM line schema for inline BOM creation during SKU creation
export const bomLineSchema = z.object({
  componentId: z.string().uuid('Component ID must be a valid UUID'),
  quantityPerUnit: z.string().min(1, 'Quantity is required'), // Supports fractions like "1/45"
})

export type BOMLineInput = z.infer<typeof bomLineSchema>

// SKU create schema
export const createSKUSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  internalCode: z
    .string()
    .min(1, 'Internal code is required')
    .max(50)
    .regex(/^[a-zA-Z0-9\-_]+$/, 'Internal code can only contain letters, numbers, hyphens, and underscores'),
  salesChannel: salesChannelSchema,
  externalIds: z.record(z.string(), z.string()).default({}),
  notes: z.string().optional().nullable(),
  // Optional BOM lines for inline BOM creation
  bomLines: z.array(bomLineSchema).optional(),
})

export type CreateSKUInput = z.infer<typeof createSKUSchema>

// SKU update schema (all fields optional)
export const updateSKUSchema = createSKUSchema.partial().extend({
  isActive: z.boolean().optional(),
})

export type UpdateSKUInput = z.infer<typeof updateSKUSchema>

// SKU list query schema
export const skuListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
  search: z.string().optional(),
  salesChannel: z.string().optional(),
  isActive: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
  sortBy: z.enum(['name', 'internalCode', 'salesChannel', 'createdAt']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
})

export type SKUListQuery = z.infer<typeof skuListQuerySchema>

// SKU response type (what API returns)
export interface SKUResponse {
  id: string
  name: string
  internalCode: string
  salesChannel: string
  externalIds: Record<string, string>
  notes: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  createdBy?: { id: string; name: string }
  activeBom?: {
    id: string
    versionName: string
    unitCost: string
  } | null
  maxBuildableUnits?: number | null
  finishedGoodsQuantity?: number | null
}

// SKU detail response (includes related data)
export interface SKUDetailResponse extends SKUResponse {
  bomVersions: BOMVersionSummary[]
  recentTransactions: Array<{
    id: string
    type: string
    date: string
    unitsBuild: number | null
    createdAt: string
  }>
  finishedGoodsInventory?: SkuInventorySummary | null
}

// BOM version summary for SKU detail
export interface BOMVersionSummary {
  id: string
  versionName: string
  effectiveStartDate: string
  effectiveEndDate: string | null
  isActive: boolean
  unitCost: string
  lineCount: number
  createdAt: string
}
