import { z } from 'zod'

// Transaction types that can be excluded from consumption calculations
export const excludableTransactionTypes = ['initial', 'adjustment', 'receipt', 'transfer'] as const
export type ExcludableTransactionType = (typeof excludableTransactionTypes)[number]

// Forecast configuration Zod schema
export const forecastConfigSchema = z.object({
  lookbackDays: z.coerce.number().int().min(7).max(365).default(30),
  safetyDays: z.coerce.number().int().min(0).max(90).default(7),
  excludedTransactionTypes: z.array(z.enum(excludableTransactionTypes)).default(['initial', 'adjustment']),
})

export type ForecastConfigInput = z.infer<typeof forecastConfigSchema>

// Partial update schema
export const updateForecastConfigSchema = forecastConfigSchema.partial()
export type UpdateForecastConfigInput = z.infer<typeof updateForecastConfigSchema>

// Default configuration values
export const DEFAULT_FORECAST_CONFIG: ForecastConfigInput = {
  lookbackDays: 30,
  safetyDays: 7,
  excludedTransactionTypes: ['initial', 'adjustment'],
}

// Forecast assumptions included in each forecast result
export interface ForecastAssumptions {
  lookbackDays: number
  safetyDays: number
  excludedTransactionTypes: string[]
}

// Single component forecast result
export interface ComponentForecast {
  componentId: string
  componentName: string
  skuCode: string
  quantityOnHand: number
  averageDailyConsumption: number
  daysUntilRunout: number | null  // null if zero consumption
  runoutDate: Date | null
  recommendedReorderQty: number
  recommendedReorderDate: Date | null
  leadTimeDays: number
  assumptions: ForecastAssumptions
}

// API response for forecast configuration
export interface ForecastConfigResponse {
  id: string
  companyId: string
  lookbackDays: number
  safetyDays: number
  excludedTransactionTypes: string[]
  createdAt: string
  updatedAt: string
}

// Serialized forecast for API responses (dates as strings)
export interface ComponentForecastResponse {
  componentId: string
  componentName: string
  skuCode: string
  quantityOnHand: number
  averageDailyConsumption: string  // Decimal as string
  daysUntilRunout: number | null
  runoutDate: string | null  // ISO date string
  recommendedReorderQty: number
  recommendedReorderDate: string | null  // ISO date string
  leadTimeDays: number
  assumptions: ForecastAssumptions
}

// API response for forecast list
export interface ForecastListResponse {
  data: ComponentForecastResponse[]
  meta: {
    total: number
    page: number
    pageSize: number
    totalPages: number
  }
  config: ForecastConfigResponse
}

// Query params for forecast list endpoint
export const forecastListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
  lookbackDays: z.coerce.number().int().min(7).max(365).optional(),
  safetyDays: z.coerce.number().int().min(0).max(90).optional(),
  sortBy: z.enum(['runoutDate', 'consumption', 'name', 'reorderQty']).default('runoutDate'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  showOnlyAtRisk: z.coerce.boolean().optional(),
})

export type ForecastListQuery = z.infer<typeof forecastListQuerySchema>
