import { z } from 'zod'

// Vendor create schema (admin only)
export const createVendorSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  contactEmail: z.string().email('Invalid email').max(255).optional().nullable(),
  contactPhone: z.string().max(50).optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export type CreateVendorInput = z.infer<typeof createVendorSchema>

// Vendor update schema (admin only)
export const updateVendorSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100).optional(),
  contactEmail: z.string().email('Invalid email').max(255).optional().nullable(),
  contactPhone: z.string().max(50).optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
})

export type UpdateVendorInput = z.infer<typeof updateVendorSchema>

// Vendor list query schema
export const vendorListQuerySchema = z.object({
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

export type VendorListQuery = z.infer<typeof vendorListQuerySchema>

// Vendor response type (what API returns)
export interface VendorResponse {
  id: string
  name: string
  contactEmail: string | null
  contactPhone: string | null
  address: string | null
  notes: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}
