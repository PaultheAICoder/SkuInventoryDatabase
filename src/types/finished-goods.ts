import { z } from 'zod'

// Finished goods adjustment schema
export const adjustFinishedGoodsSchema = z.object({
  skuId: z.string().uuid('Invalid SKU ID'),
  locationId: z.string().uuid('Invalid location ID'),
  quantity: z.coerce.number().refine((val) => val !== 0, 'Quantity cannot be zero'),
  reason: z.string().min(1, 'Reason is required').max(200),
  notes: z.string().optional().nullable(),
  date: z.coerce.date(),
})

export type AdjustFinishedGoodsInput = z.infer<typeof adjustFinishedGoodsSchema>

// Finished goods transfer schema
export const transferFinishedGoodsSchema = z.object({
  skuId: z.string().uuid('Invalid SKU ID'),
  fromLocationId: z.string().uuid('Invalid from location ID'),
  toLocationId: z.string().uuid('Invalid to location ID'),
  quantity: z.coerce.number().positive('Quantity must be positive'),
  notes: z.string().optional().nullable(),
  date: z.coerce.date(),
})

export type TransferFinishedGoodsInput = z.infer<typeof transferFinishedGoodsSchema>

// SKU inventory response (per location)
export interface SkuInventoryByLocation {
  locationId: string
  locationName: string
  locationType: string
  quantity: number
}

// SKU inventory summary
export interface SkuInventorySummary {
  totalQuantity: number
  byLocation: SkuInventoryByLocation[]
}

// Finished goods line response
export interface FinishedGoodsLineResponse {
  id: string
  skuId: string
  skuName: string
  skuInternalCode: string
  quantityChange: string
  costPerUnit: string | null
  locationId: string
  locationName: string
}
