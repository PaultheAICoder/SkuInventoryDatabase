import { z } from 'zod'

// Location type enum values
export const LOCATION_TYPES = ['warehouse', 'threepl', 'fba', 'finished_goods'] as const
export type LocationType = (typeof LOCATION_TYPES)[number]

export const LOCATION_TYPE_DISPLAY_NAMES: Record<LocationType, string> = {
  warehouse: 'Warehouse',
  threepl: '3PL',
  fba: 'FBA',
  finished_goods: 'Finished Goods',
}

// Location create schema (admin only)
export const createLocationSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  type: z.enum(LOCATION_TYPES).default('warehouse'),
  isDefault: z.boolean().default(false),
  notes: z.string().optional().nullable(),
})

export type CreateLocationInput = z.infer<typeof createLocationSchema>

// Location update schema (admin only)
export const updateLocationSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100).optional(),
  type: z.enum(LOCATION_TYPES).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  notes: z.string().optional().nullable(),
})

export type UpdateLocationInput = z.infer<typeof updateLocationSchema>

// Location list query schema
export const locationListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
  search: z.string().optional(),
  type: z.enum(LOCATION_TYPES).optional(),
  isActive: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
  sortBy: z.enum(['name', 'type', 'createdAt']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
})

export type LocationListQuery = z.infer<typeof locationListQuerySchema>

// Location response type (what API returns)
export interface LocationResponse {
  id: string
  name: string
  type: LocationType
  isDefault: boolean
  isActive: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
}
