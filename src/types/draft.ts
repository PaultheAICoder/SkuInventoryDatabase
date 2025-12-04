import { z } from 'zod'

// =============================================================================
// Transaction Status Types
// =============================================================================

export type TransactionStatus = 'draft' | 'approved' | 'rejected'

// =============================================================================
// Draft Creation Schema
// =============================================================================

/**
 * Schema for creating a draft transaction
 * Accepts the same data as regular transactions but stores for review
 */
export const createDraftSchema = z.object({
  type: z.enum(['receipt', 'build', 'adjustment', 'initial', 'transfer']),
  date: z.coerce.date(),
  // Receipt/Adjustment/Initial/Transfer fields
  componentId: z.string().uuid('Invalid component ID').optional(),
  quantity: z.coerce.number().optional(),
  supplier: z.string().max(100).optional(),
  costPerUnit: z.coerce.number().nonnegative().optional(),
  updateComponentCost: z.boolean().default(false),
  reason: z.string().max(200).optional(),
  // Build fields
  skuId: z.string().uuid('Invalid SKU ID').optional(),
  unitsToBuild: z.coerce.number().int().positive().optional(),
  salesChannel: z.string().optional(),
  // Transfer fields
  fromLocationId: z.string().uuid('Invalid from location ID').optional(),
  toLocationId: z.string().uuid('Invalid to location ID').optional(),
  // Common fields
  locationId: z.string().uuid('Invalid location ID').optional(),
  notes: z.string().optional().nullable(),
  // Lot tracking
  lotNumber: z.string().max(100).optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format').optional(),
  // Quality tracking
  defectCount: z.coerce.number().int().nonnegative().optional().nullable(),
  defectNotes: z.string().optional().nullable(),
  affectedUnits: z.coerce.number().int().nonnegative().optional().nullable(),
})

export type CreateDraftInput = z.infer<typeof createDraftSchema>

// =============================================================================
// Update Draft Schema
// =============================================================================

export const updateDraftSchema = createDraftSchema.partial()

export type UpdateDraftInput = z.infer<typeof updateDraftSchema>

// =============================================================================
// Reject Draft Schema
// =============================================================================

export const rejectDraftSchema = z.object({
  reason: z.string().max(500).optional(),
})

export type RejectDraftInput = z.infer<typeof rejectDraftSchema>

// =============================================================================
// Batch Approve Schema
// =============================================================================

export const batchApproveDraftsSchema = z.object({
  draftIds: z.array(z.string().uuid()).min(1).max(50),
})

export type BatchApproveDraftsInput = z.infer<typeof batchApproveDraftsSchema>

// =============================================================================
// Draft List Query Schema
// =============================================================================

export const draftListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  type: z.enum(['receipt', 'build', 'adjustment', 'initial', 'transfer']).optional(),
  status: z.enum(['draft', 'approved', 'rejected']).optional(),
  sortBy: z.enum(['date', 'createdAt', 'type']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export type DraftListQuery = z.infer<typeof draftListQuerySchema>

// =============================================================================
// Status Badge Configuration
// =============================================================================

export const DRAFT_STATUS_CONFIG = {
  draft: { label: 'Pending Review', variant: 'warning' as const },
  approved: { label: 'Approved', variant: 'success' as const },
  rejected: { label: 'Rejected', variant: 'destructive' as const },
} as const

export type DraftStatusKey = keyof typeof DRAFT_STATUS_CONFIG

// =============================================================================
// Draft Response Types
// =============================================================================

export interface DraftTransactionResponse {
  id: string
  type: 'receipt' | 'build' | 'adjustment' | 'initial' | 'transfer'
  status: TransactionStatus
  date: string
  // Type-specific fields from Transaction
  sku?: { id: string; name: string } | null
  bomVersion?: { id: string; versionName: string } | null
  locationId: string | null
  location?: { id: string; name: string } | null
  fromLocationId?: string | null
  fromLocation?: { id: string; name: string } | null
  toLocationId?: string | null
  toLocation?: { id: string; name: string } | null
  salesChannel: string | null
  unitsBuild: number | null
  supplier: string | null
  reason: string | null
  notes: string | null
  rejectReason: string | null
  createdAt: string
  createdBy: { id: string; name: string }
  reviewedAt: string | null
  reviewedBy: { id: string; name: string } | null
  lines: Array<{
    id: string
    component: { id: string; name: string; skuCode: string }
    quantityChange: string
    costPerUnit: string | null
    lotId: string | null
    lot: { id: string; lotNumber: string; expiryDate: string | null } | null
  }>
}

// =============================================================================
// Batch Approve Response
// =============================================================================

export interface BatchApproveResult {
  total: number
  succeeded: number
  failed: number
  results: Array<{
    id: string
    success: boolean
    error?: string
  }>
}
