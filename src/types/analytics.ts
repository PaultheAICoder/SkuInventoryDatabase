import { z } from 'zod'
import { dateSchema } from './index'

// Query parameters for analytics endpoint
export const defectAnalyticsQuerySchema = z.object({
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
  skuId: z.string().uuid().optional(),
  bomVersionId: z.string().uuid().optional(),
  salesChannel: z.string().optional(),
  groupBy: z.enum(['day', 'week', 'month']).default('day'),
})

export type DefectAnalyticsQuery = z.infer<typeof defectAnalyticsQuerySchema>

// Defect rate trend data point (time series)
export interface DefectRateTrendPoint {
  date: string // ISO date string (YYYY-MM-DD)
  totalBuilds: number
  totalUnitsBuilt: number
  totalDefects: number
  totalAffectedUnits: number
  defectRate: number // (totalDefects / totalUnitsBuilt) * 100
  affectedRate: number // (totalAffectedUnits / totalUnitsBuilt) * 100
}

// Defect rate by BOM version
export interface DefectRateByBOM {
  bomVersionId: string
  bomVersionName: string
  skuId: string
  skuName: string
  skuCode: string
  effectiveStartDate: string
  totalBuilds: number
  totalUnitsBuilt: number
  totalDefects: number
  totalAffectedUnits: number
  defectRate: number
  affectedRate: number
}

// Defect rate by SKU
export interface DefectRateBySKU {
  skuId: string
  skuName: string
  skuCode: string
  totalBuilds: number
  totalUnitsBuilt: number
  totalDefects: number
  totalAffectedUnits: number
  defectRate: number
  affectedRate: number
}

// Summary statistics
export interface DefectAnalyticsSummary {
  totalBuilds: number
  totalUnitsBuilt: number
  totalDefects: number
  totalAffectedUnits: number
  overallDefectRate: number
  overallAffectedRate: number
  avgDefectRate: number
  maxDefectRate: number
  minDefectRate: number
}

// Full analytics response
export interface DefectAnalyticsResponse {
  summary: DefectAnalyticsSummary
  trends: DefectRateTrendPoint[]
  byBOMVersion: DefectRateByBOM[]
  bySKU: DefectRateBySKU[]
  filters: {
    dateFrom: string | null
    dateTo: string | null
    skuId: string | null
    bomVersionId: string | null
    salesChannel: string | null
    groupBy: 'day' | 'week' | 'month'
  }
}

// Export data types
export interface DefectAnalyticsExportRow {
  date: string
  skuName: string
  skuCode: string
  bomVersionName: string
  salesChannel: string | null
  unitsBuilt: number
  defectCount: number
  affectedUnits: number
  defectRate: string
  defectNotes: string | null
}
