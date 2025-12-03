import { z } from 'zod'

// Threshold configuration schema
export const defectThresholdSchema = z.object({
  skuId: z.string().uuid().optional().nullable(), // null = global
  defectRateLimit: z.coerce.number().min(0).max(100),
  affectedRateLimit: z.coerce.number().min(0).max(100).optional().nullable(),
  isActive: z.boolean().default(true),
})

export const createThresholdSchema = defectThresholdSchema
export const updateThresholdSchema = defectThresholdSchema.partial()

export type CreateThresholdInput = z.infer<typeof createThresholdSchema>
export type UpdateThresholdInput = z.infer<typeof updateThresholdSchema>

// Alert severity
export type AlertSeverity = 'warning' | 'critical'

// Threshold response
export interface DefectThresholdResponse {
  id: string
  companyId: string
  skuId: string | null
  skuName: string | null
  skuCode: string | null
  defectRateLimit: number
  affectedRateLimit: number | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  createdBy: { id: string; name: string }
}

// Alert response
export interface DefectAlertResponse {
  id: string
  thresholdId: string
  transactionId: string
  skuId: string
  skuName: string
  skuCode: string
  defectRate: number
  thresholdValue: number
  severity: AlertSeverity
  acknowledgedAt: string | null
  acknowledgedBy: { id: string; name: string } | null
  createdAt: string
  transaction: {
    id: string
    date: string
    unitsBuild: number
    defectCount: number
  }
}

// Alert query schema
export const alertQuerySchema = z.object({
  skuId: z.string().uuid().optional(),
  acknowledged: z.enum(['true', 'false', 'all']).default('all'),
  severity: z.enum(['warning', 'critical', 'all']).default('all'),
  limit: z.coerce.number().int().positive().max(100).default(50),
})

export type AlertQuery = z.infer<typeof alertQuerySchema>

// Acknowledge schema
export const acknowledgeAlertSchema = z.object({
  alertIds: z.array(z.string().uuid()).min(1),
})

export type AcknowledgeAlertInput = z.infer<typeof acknowledgeAlertSchema>
