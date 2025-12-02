import { z } from 'zod'

// Component create schema
export const createComponentSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  skuCode: z
    .string()
    .min(1, 'SKU code is required')
    .max(50)
    .regex(/^[a-zA-Z0-9\-_]+$/, 'SKU code can only contain letters, numbers, hyphens, and underscores'),
  category: z.string().max(50).optional().nullable(),
  unitOfMeasure: z.string().max(20).default('each'),
  costPerUnit: z.coerce.number().nonnegative('Cost must be non-negative').default(0),
  reorderPoint: z.coerce.number().int().nonnegative('Reorder point must be non-negative').default(0),
  leadTimeDays: z.coerce.number().int().nonnegative('Lead time must be non-negative').default(0),
  notes: z.string().optional().nullable(),
})

export type CreateComponentInput = z.infer<typeof createComponentSchema>

// Component update schema (all fields optional)
export const updateComponentSchema = createComponentSchema.partial().extend({
  isActive: z.boolean().optional(),
})

export type UpdateComponentInput = z.infer<typeof updateComponentSchema>

// Component list query schema
export const componentListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
  search: z.string().optional(),
  category: z.string().optional(),
  isActive: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
  reorderStatus: z.enum(['critical', 'warning', 'ok']).optional(),
  sortBy: z.enum(['name', 'skuCode', 'category', 'costPerUnit', 'reorderPoint', 'createdAt']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
})

export type ComponentListQuery = z.infer<typeof componentListQuerySchema>

// Component response type (what API returns)
export interface ComponentResponse {
  id: string
  name: string
  skuCode: string
  category: string | null
  unitOfMeasure: string
  costPerUnit: string
  reorderPoint: number
  leadTimeDays: number
  notes: string | null
  isActive: boolean
  quantityOnHand: number
  reorderStatus: 'critical' | 'warning' | 'ok'
  createdAt: string
  updatedAt: string
  createdBy?: { id: string; name: string }
}

// Component detail response (includes related data)
export interface ComponentDetailResponse extends ComponentResponse {
  usedInSkus: Array<{
    id: string
    name: string
    quantityPerUnit: string
  }>
  recentTransactions: Array<{
    id: string
    type: string
    date: string
    quantityChange: string
    createdAt: string
  }>
}
