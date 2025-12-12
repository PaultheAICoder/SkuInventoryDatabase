/**
 * Spreadsheet (CSV/XLSX) Processing Types
 */

export type CsvSource = 'amazon_search_term' | 'zonguru' | 'helium10'
export type FileType = 'csv' | 'xlsx'

export interface CsvColumnMapping {
  sourceColumn: string
  targetField: string
  transform?: (value: string) => unknown
}

export interface CsvMapper {
  source: CsvSource
  requiredColumns: string[]
  optionalColumns: string[]
  mappings: CsvColumnMapping[]
  validateRow: (row: Record<string, string>) => ValidationResult
  transformRow: (row: Record<string, string>) => KeywordMetricRow
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export interface KeywordMetricRow {
  keyword: string
  matchType: 'exact' | 'phrase' | 'broad' | 'auto'
  campaignName?: string
  adGroupName?: string
  impressions: number
  clicks: number
  ctr?: number
  spend: number
  cpc?: number
  orders: number
  sales: number
  roas?: number
  acos?: number
  conversionRate?: number
  date?: Date
  metadata?: Record<string, unknown>
}

export interface ParseOptions {
  source: CsvSource
  brandId?: string
  dateRange?: {
    startDate: string
    endDate: string
  }
}

export interface ParseProgress {
  totalRows: number
  processedRows: number
  validRows: number
  invalidRows: number
  percentComplete: number
}

export interface ParseResult {
  success: boolean
  syncLogId?: string
  totalRows: number
  recordsCreated: number
  recordsUpdated: number
  recordsFailed: number
  errors: ParseError[]
}

export interface ParseError {
  row: number
  column?: string
  message: string
}
