import { z } from 'zod'
import type { ReorderStatus } from '@/types'

// Alert modes for throttling
export const alertModeSchema = z.enum(['daily_digest', 'per_transition'])
export type AlertMode = z.infer<typeof alertModeSchema>

// Slack webhook URL validation (must be https://hooks.slack.com/...)
const slackWebhookUrlSchema = z
  .string()
  .url()
  .max(500)
  .refine(
    (url) => url.startsWith('https://hooks.slack.com/services/'),
    { message: 'Slack webhook URL must start with https://hooks.slack.com/services/' }
  )
  .optional()
  .nullable()

// Alert config create/update schema
export const alertConfigSchema = z.object({
  slackWebhookUrl: slackWebhookUrlSchema,
  emailAddresses: z.array(z.string().email()).default([]),
  enableSlack: z.boolean().default(false),
  enableEmail: z.boolean().default(false),
  alertMode: alertModeSchema.default('daily_digest'),
})

export type AlertConfigInput = z.infer<typeof alertConfigSchema>

export const updateAlertConfigSchema = alertConfigSchema.partial()
export type UpdateAlertConfigInput = z.infer<typeof updateAlertConfigSchema>

// Alert config response (what API returns)
export interface AlertConfigResponse {
  id: string
  companyId: string
  slackWebhookUrl: string | null
  emailAddresses: string[]
  enableSlack: boolean
  enableEmail: boolean
  alertMode: AlertMode
  lastDigestSent: string | null
  createdAt: string
  updatedAt: string
}

// Component alert state response
export interface ComponentAlertStateResponse {
  id: string
  componentId: string
  lastStatus: ReorderStatus
  lastAlertSent: string | null
  createdAt: string
  updatedAt: string
}

// State transition types
export type AlertTransition =
  | 'ok_to_warning'
  | 'ok_to_critical'
  | 'warning_to_critical'
  | 'warning_to_ok'
  | 'critical_to_warning'
  | 'critical_to_ok'
  | 'no_change'

// Component that needs an alert (state transition detected)
export interface ComponentAlertNeeded {
  componentId: string
  componentName: string
  skuCode: string
  brandName: string
  previousStatus: ReorderStatus
  currentStatus: ReorderStatus
  transition: AlertTransition
  quantityOnHand: number
  reorderPoint: number
  leadTimeDays: number
}

// Result of evaluateLowStockAlerts()
export interface LowStockAlertEvaluation {
  companyId: string
  evaluatedAt: string
  totalComponents: number
  componentsNeedingAlert: ComponentAlertNeeded[]
  newWarnings: number
  newCriticals: number
  recoveries: number // Components that went back to OK
}
