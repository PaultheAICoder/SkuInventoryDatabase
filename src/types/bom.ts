import { z } from 'zod'
import { parseFractionOrNumber } from '@/lib/utils'

// BOM line schema (for creating/updating BOM versions)
export const bomLineSchema = z.object({
  componentId: z.string().uuid('Invalid component ID'),
  quantityPerUnit: z
    .union([z.string(), z.number()])
    .transform((val, ctx) => {
      // If already a number, validate it directly
      if (typeof val === 'number') {
        if (isNaN(val) || val <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Quantity must be a positive number',
          })
          return z.NEVER
        }
        return val
      }

      // Parse string (fraction or decimal)
      const parsed = parseFractionOrNumber(val)
      if (parsed === null || parsed <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Quantity must be a positive number or fraction (e.g., "1", "0.5", "1/45")',
        })
        return z.NEVER
      }
      return parsed
    }),
  notes: z.string().optional().nullable(),
})

export type BOMLineInput = z.infer<typeof bomLineSchema>

// BOM version create schema
export const createBOMVersionSchema = z.object({
  versionName: z.string().min(1, 'Version name is required').max(50),
  effectiveStartDate: z.coerce.date(),
  isActive: z.boolean().default(false),
  notes: z.string().optional().nullable(),
  defectNotes: z.string().optional().nullable(),
  qualityMetadata: z.record(z.string(), z.unknown()).optional().default({}),
  lines: z.array(bomLineSchema).min(1, 'At least one component is required'),
})

export type CreateBOMVersionInput = z.infer<typeof createBOMVersionSchema>

// BOM version clone schema
export const cloneBOMVersionSchema = z.object({
  versionName: z.string().min(1, 'Version name is required').max(50),
})

export type CloneBOMVersionInput = z.infer<typeof cloneBOMVersionSchema>

// BOM version list query schema
export const bomVersionListQuerySchema = z.object({
  includeInactive: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
})

export type BOMVersionListQuery = z.infer<typeof bomVersionListQuerySchema>

// BOM line response type
export interface BOMLineResponse {
  id: string
  component: {
    id: string
    name: string
    skuCode: string
    costPerUnit: string
    unitOfMeasure: string
    quantityOnHand?: number
  }
  quantityPerUnit: string
  lineCost: string
  notes: string | null
}

// BOM version response type
export interface BOMVersionResponse {
  id: string
  skuId: string
  versionName: string
  effectiveStartDate: string
  effectiveEndDate: string | null
  isActive: boolean
  notes: string | null
  defectNotes: string | null
  qualityMetadata: Record<string, unknown>
  unitCost: string
  lines: BOMLineResponse[]
  createdAt: string
  createdBy?: { id: string; name: string }
}

// BOM version detail response (includes SKU info)
export interface BOMVersionDetailResponse extends BOMVersionResponse {
  sku: {
    id: string
    name: string
    internalCode: string
  }
}
