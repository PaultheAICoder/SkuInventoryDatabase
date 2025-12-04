import { z } from 'zod'

// Company create schema (admin only)
export const createCompanySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
})

export type CreateCompanyInput = z.infer<typeof createCompanySchema>

// Company update schema (admin only)
export const updateCompanySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less').optional(),
  brandIds: z.array(z.string().uuid()).optional(),
})

export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>

// Company list query schema
export const companyListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
  search: z.string().optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
})

export type CompanyListQuery = z.infer<typeof companyListQuerySchema>

// Brand info returned with company details
export interface BrandInfo {
  id: string
  name: string
  isActive: boolean
  componentCount: number
  skuCount: number
}

// Company response type (what API returns)
export interface CompanyResponse {
  id: string
  name: string
  userCount: number
  brandCount: number
  brands?: BrandInfo[]
  createdAt: string
  updatedAt: string
}
