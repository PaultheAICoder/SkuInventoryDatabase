import { z } from 'zod'

// Company settings schema
export const companySettingsSchema = z.object({
  // Inventory settings
  allowNegativeInventory: z.boolean().default(false),
  defaultLeadTimeDays: z.coerce.number().int().nonnegative().default(7),
  reorderWarningMultiplier: z.coerce.number().positive().default(1.5),

  // Display settings
  dateFormat: z.enum(['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD']).default('MM/DD/YYYY'),
  currencySymbol: z.string().max(5).default('$'),
  decimalPlaces: z.coerce.number().int().min(0).max(4).default(2),
})

export type CompanySettings = z.infer<typeof companySettingsSchema>

// Update settings schema (partial)
export const updateSettingsSchema = companySettingsSchema.partial()

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>

// Default settings
export const DEFAULT_SETTINGS: CompanySettings = {
  allowNegativeInventory: false,
  defaultLeadTimeDays: 7,
  reorderWarningMultiplier: 1.5,
  dateFormat: 'MM/DD/YYYY',
  currencySymbol: '$',
  decimalPlaces: 2,
}

// Settings response type
export interface SettingsResponse {
  companyId: string
  companyName: string
  settings: CompanySettings
  updatedAt: string
}
