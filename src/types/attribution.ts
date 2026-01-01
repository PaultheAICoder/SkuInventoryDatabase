/**
 * Attribution Service Types
 * Types for organic vs ad sales attribution
 */

import { z } from 'zod'

// Attribution window options
export type AttributionWindow = '7d' | '14d' | '30d'

// Query parameters for attribution endpoint
export const attributionQuerySchema = z.object({
  brandId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  asin: z.string().optional(),
  attributionWindow: z.enum(['7d', '14d', '30d']).default('7d'),
  groupBy: z.enum(['day', 'week', 'month']).default('day'),
})

export type AttributionQuery = z.infer<typeof attributionQuerySchema>

// Per-ASIN attribution breakdown
export interface AsinAttribution {
  asin: string
  productName?: string
  totalSales: number
  adAttributedSales: number
  organicSales: number
  organicPercentage: number
  adPercentage: number
  unitsTotal: number
  unitsAdAttributed: number
  unitsOrganic: number
  hasAnomaly: boolean  // true if adSales > totalSales
  anomalyNote?: string
}

// Daily attribution with trend
export interface DailyAttribution {
  date: string  // YYYY-MM-DD
  totalSales: number
  adAttributedSales: number
  organicSales: number
  organicPercentage: number
  adPercentage: number
  orderCount: number
  asinBreakdown: AsinAttribution[]
}

// Attribution summary
export interface AttributionSummary {
  totalSales: number
  adAttributedSales: number
  organicSales: number
  organicPercentage: number
  adPercentage: number
  totalOrders: number
  asinCount: number
  anomalyCount: number  // Count of days/ASINs with ad > total
  attributionWindow: AttributionWindow
}

// Trend data point for charting
export interface AttributionTrendPoint {
  date: string
  organicPercentage: number
  adPercentage: number
  totalSales: number
}

// Full attribution response
export interface AttributionResponse {
  summary: AttributionSummary
  daily: DailyAttribution[]
  trends: AttributionTrendPoint[]
  byAsin: AsinAttribution[]
  dateRange: {
    startDate: string
    endDate: string
  }
  attributionWindow: AttributionWindow
}

// Options for attribution calculation
export interface CalculateAttributionOptions {
  brandId: string
  startDate: string
  endDate: string
  asin?: string
  attributionWindow?: AttributionWindow
  groupBy?: 'day' | 'week' | 'month'
}

// Result from recalculating attribution
export interface RecalculateAttributionResult {
  recordsUpdated: number
  anomaliesDetected: number
  errors: string[]
}
