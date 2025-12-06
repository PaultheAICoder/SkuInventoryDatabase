import { z } from 'zod'

// Common pagination schema
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
})

export type PaginationParams = z.infer<typeof paginationSchema>

// Common pagination response
export interface PaginatedResponse<T> {
  data: T[]
  meta: {
    total: number
    page: number
    pageSize: number
    totalPages: number
  }
}

// User roles
export type UserRole = 'admin' | 'ops' | 'viewer'

// Reorder status
export type ReorderStatus = 'critical' | 'warning' | 'ok'

// Transaction types
export type TransactionType = 'receipt' | 'build' | 'adjustment' | 'initial' | 'transfer' | 'outbound'

// Sales channels
export const salesChannels = ['Amazon', 'Shopify', 'TikTok', 'Generic'] as const
export type SalesChannel = (typeof salesChannels)[number]

export const salesChannelSchema = z.enum(salesChannels)

// Date validation helper
export const dateSchema = z.coerce.date()

// Decimal validation (for quantities and costs)
export const decimalSchema = z.coerce.number().nonnegative()
export const positiveDecimalSchema = z.coerce.number().positive()

// ID validation
export const uuidSchema = z.string().uuid()

// Common search params
export const searchSchema = z.object({
  search: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
})

// API Error response
export interface ApiError {
  error: string
  message: string
  details?: Array<{ field: string; message: string }>
}

// API Success response
export interface ApiSuccess<T> {
  data: T
  message?: string
}

// Company info for session
export interface SessionCompany {
  id: string
  name: string
  role?: 'admin' | 'ops' | 'viewer'
}

// Brand info for session
export interface SessionBrand {
  id: string
  name: string
}

// Company with nested brands for unified selector
export interface CompanyWithBrands extends SessionCompany {
  brands: SessionBrand[]
}

// Session user type (matches NextAuth)
export interface SessionUser {
  id: string
  email: string
  name: string
  role: UserRole
  companyId: string  // Selected company ID (for backward compatibility)
  companyName: string  // Selected company name
  companies: SessionCompany[]  // All accessible companies
  selectedCompanyId: string  // Currently selected company
  selectedCompanyName: string  // Currently selected company name
  selectedBrandId: string | null  // Currently selected brand (null if company has no brands)
  selectedBrandName: string | null  // Currently selected brand name
  brands: SessionBrand[]  // Brands for the selected company
}
