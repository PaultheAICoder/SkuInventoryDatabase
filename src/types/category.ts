import { z } from 'zod'

// Category create schema (admin only)
export const createCategorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name must be 50 characters or less'),
})

export type CreateCategoryInput = z.infer<typeof createCategorySchema>

// Category update schema (admin only)
export const updateCategorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(50).optional(),
  isActive: z.boolean().optional(),
})

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>

// Category list query schema
export const categoryListQuerySchema = z.object({
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

export type CategoryListQuery = z.infer<typeof categoryListQuerySchema>

// Category response type (what API returns)
export interface CategoryResponse {
  id: string
  name: string
  isActive: boolean
  companyId?: string
  companyName?: string
  componentCount: number
  createdAt: string
  updatedAt: string
}

// Category list response type
export interface CategoryListResponse {
  data: CategoryResponse[]
  meta: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}
