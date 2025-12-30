/**
 * [V2-DEFERRED] Channel Mapping Types
 * Moved from src/types/channel-mapping.ts on 2025-12-06
 * Reason: PRD V1 explicitly excludes integrations
 * Restore: Move back to src/types/ when V2 work begins
 */

/**
 * Channel Mapping Types and Schemas
 * Used for mapping external channel identifiers (Shopify, Amazon, TikTok) to internal SKUs
 */

import { z } from 'zod'

// Channel types supported
export const channelTypes = ['shopify', 'amazon', 'tiktok'] as const
export type ChannelType = (typeof channelTypes)[number]

// Display names for channel types
export const CHANNEL_TYPE_DISPLAY_NAMES: Record<ChannelType, string> = {
  shopify: 'Shopify',
  amazon: 'Amazon',
  tiktok: 'TikTok',
}

// Create mapping schema
export const createMappingSchema = z.object({
  channelType: z.enum(channelTypes).default('shopify'),
  externalId: z.string().min(1, 'External ID is required'),
  externalSku: z.string().optional(),
  skuId: z.string().uuid('Invalid SKU ID'),
})

export type CreateMappingInput = z.infer<typeof createMappingSchema>

// Update mapping schema
export const updateMappingSchema = z.object({
  skuId: z.string().uuid('Invalid SKU ID').optional(),
  externalSku: z.string().optional(),
  isActive: z.boolean().optional(),
})

export type UpdateMappingInput = z.infer<typeof updateMappingSchema>

// Mapping list query schema
export const mappingListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
  search: z.string().optional(),
  channelType: z.string().optional(),
  isActive: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
})

export type MappingListQuery = z.infer<typeof mappingListQuerySchema>

// Mapping response type (what API returns)
export interface MappingResponse {
  id: string
  channelType: string
  externalId: string
  externalSku: string | null
  skuId: string
  sku: {
    id: string
    name: string
    internalCode: string
  }
  isActive: boolean
  createdAt: string
  updatedAt: string
}

// CSV import schema for mappings
export const mappingImportSchema = z.object({
  channel_type: z.string().optional().default('shopify'),
  external_id: z.string().min(1, 'External ID is required'),
  external_sku: z.string().optional(),
  internal_sku_code: z.string().min(1, 'Internal SKU code is required'),
})

export type MappingImportRow = z.infer<typeof mappingImportSchema>

// Import result types
export interface MappingImportResult {
  total: number
  imported: number
  skipped: number
  errors: Array<{
    rowNumber: number
    externalId: string
    errors: string[]
  }>
}
