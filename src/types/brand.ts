import { z } from 'zod'

// Brand create schema (admin only)
export const createBrandSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
})

export type CreateBrandInput = z.infer<typeof createBrandSchema>

// Brand update schema (admin only)
export const updateBrandSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100).optional(),
  isActive: z.boolean().optional(),
})

export type UpdateBrandInput = z.infer<typeof updateBrandSchema>

// Brand list query schema
export const brandListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
  search: z.string().optional(),
  isActive: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
  sortBy: z.enum(['name', 'createdAt']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
})

export type BrandListQuery = z.infer<typeof brandListQuerySchema>

// Brand response type (what API returns)
export interface BrandResponse {
  id: string
  name: string
  isActive: boolean
  companyId?: string
  companyName?: string
  componentCount: number
  skuCount: number
  createdAt: string
  updatedAt: string
}

// Brand list response type
export interface BrandListResponse {
  data: BrandResponse[]
  meta: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}
