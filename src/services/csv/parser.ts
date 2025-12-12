/**
 * Spreadsheet Parser Service
 *
 * Parses and processes CSV and XLSX files for keyword/search term data.
 */

import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { getMapper, validateHeaders } from './mappers'
import type {
  CsvSource,
  FileType,
  ParseOptions,
  ParseResult,
  ParseError,
  KeywordMetricRow,
} from './types'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const BATCH_SIZE = 100

/**
 * Detect file type from filename extension
 */
export function detectFileType(filename: string): FileType | null {
  const ext = filename.toLowerCase().split('.').pop()
  if (ext === 'csv') return 'csv'
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx'
  return null
}

/**
 * Parse an XLSX file to array of row objects
 */
function parseXlsx(buffer: ArrayBuffer): { headers: string[]; data: Record<string, string>[] } {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[firstSheetName]

  // Get raw data as 2D array
  const rawData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' })

  if (rawData.length === 0) {
    return { headers: [], data: [] }
  }

  // First row is headers
  const headers = (rawData[0] as string[]).map(h => String(h).trim())

  // Rest are data rows
  const data: Record<string, string>[] = []
  for (let i = 1; i < rawData.length; i++) {
    const rowArray = rawData[i] as string[]
    // Skip empty rows
    if (rowArray.every(cell => !cell || String(cell).trim() === '')) continue

    const row: Record<string, string> = {}
    headers.forEach((header, index) => {
      row[header] = rowArray[index] !== undefined ? String(rowArray[index]).trim() : ''
    })
    data.push(row)
  }

  return { headers, data }
}

/**
 * Parse a CSV string to array of row objects
 */
function parseCsv(content: string): { headers: string[]; data: Record<string, string>[]; errors: Array<{ row: number; message: string }> } {
  const parseResult = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  })

  return {
    headers: parseResult.meta.fields || [],
    data: parseResult.data,
    errors: parseResult.errors.map((e, i) => ({
      row: e.row || i,
      message: e.message,
    })),
  }
}

/**
 * Parse a spreadsheet file (CSV or XLSX) and store keyword metrics
 */
export async function parseFile(
  fileContent: string | ArrayBuffer,
  options: ParseOptions & { fileType?: FileType },
  callbacks?: {
    onProgress?: (processed: number, total: number) => void
    syncLogId?: string
  }
): Promise<ParseResult> {
  const { source, brandId, dateRange, fileType = 'csv' } = options
  const errors: ParseError[] = []
  let totalRows = 0
  let recordsCreated = 0
  let recordsUpdated = 0
  let recordsFailed = 0

  // Get mapper for source
  const mapper = getMapper(source)

  // Parse file based on type
  let headers: string[]
  let data: Record<string, string>[]

  if (fileType === 'xlsx') {
    if (!(fileContent instanceof ArrayBuffer)) {
      return {
        success: false,
        totalRows: 0,
        recordsCreated: 0,
        recordsUpdated: 0,
        recordsFailed: 0,
        errors: [{ row: 0, message: 'XLSX files must be provided as ArrayBuffer' }],
      }
    }
    const xlsxResult = parseXlsx(fileContent)
    headers = xlsxResult.headers
    data = xlsxResult.data
  } else {
    if (typeof fileContent !== 'string') {
      return {
        success: false,
        totalRows: 0,
        recordsCreated: 0,
        recordsUpdated: 0,
        recordsFailed: 0,
        errors: [{ row: 0, message: 'CSV files must be provided as string' }],
      }
    }
    const csvResult = parseCsv(fileContent)
    headers = csvResult.headers
    data = csvResult.data

    if (csvResult.errors.length > 0) {
      return {
        success: false,
        totalRows: 0,
        recordsCreated: 0,
        recordsUpdated: 0,
        recordsFailed: 0,
        errors: csvResult.errors,
      }
    }
  }

  // Validate headers
  const headerValidation = validateHeaders(source, headers)

  if (!headerValidation.valid) {
    return {
      success: false,
      totalRows: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsFailed: 0,
      errors: [{
        row: 0,
        message: `Missing required columns: ${headerValidation.missingRequired.join(', ')}`,
      }],
    }
  }

  totalRows = data.length

  // Process in batches
  const batch: KeywordMetricRow[] = []

  for (let i = 0; i < data.length; i++) {
    const row = data[i]

    // Validate row
    const validation = mapper.validateRow(row)
    if (!validation.valid) {
      errors.push({
        row: i + 2, // +2 for header row and 1-based index
        message: validation.errors.join('; '),
      })
      recordsFailed++
      continue
    }

    // Transform row
    try {
      const transformed = mapper.transformRow(row)
      batch.push(transformed)
    } catch (error) {
      errors.push({
        row: i + 2,
        message: error instanceof Error ? error.message : 'Transform error',
      })
      recordsFailed++
    }

    // Process batch
    if (batch.length >= BATCH_SIZE) {
      const result = await processBatch(batch, source, brandId, dateRange)
      recordsCreated += result.created
      recordsUpdated += result.updated
      recordsFailed += result.failed
      batch.length = 0

      // Report progress
      if (callbacks?.onProgress) {
        callbacks.onProgress(i + 1, totalRows)
      }
    }
  }

  // Process remaining batch
  if (batch.length > 0) {
    const result = await processBatch(batch, source, brandId, dateRange)
    recordsCreated += result.created
    recordsUpdated += result.updated
    recordsFailed += result.failed
  }

  // Update sync log if provided
  if (callbacks?.syncLogId) {
    await prisma.syncLog.update({
      where: { id: callbacks.syncLogId },
      data: {
        status: errors.length > 0 ? 'partial' : 'completed',
        completedAt: new Date(),
        recordsProcessed: totalRows,
        recordsCreated,
        recordsUpdated,
        recordsFailed,
        errorMessage: errors.length > 0
          ? errors.slice(0, 5).map(e => `Row ${e.row}: ${e.message}`).join('; ')
          : null,
        errorDetails: errors.length > 0
          ? { errors: errors.slice(0, 100).map(e => ({ row: e.row, message: e.message })) }
          : {},
      },
    })
  }

  return {
    success: errors.length === 0,
    syncLogId: callbacks?.syncLogId,
    totalRows,
    recordsCreated,
    recordsUpdated,
    recordsFailed,
    errors: errors.slice(0, 100), // Limit returned errors
  }
}

async function processBatch(
  rows: KeywordMetricRow[],
  source: CsvSource,
  brandId?: string,
  dateRange?: { startDate: string; endDate: string }
): Promise<{ created: number; updated: number; failed: number }> {
  let created = 0
  let updated = 0
  let failed = 0

  const sourceMapping: Record<CsvSource, string> = {
    amazon_search_term: 'csv_amazon',
    zonguru: 'csv_zonguru',
    helium10: 'csv_helium10',
  }

  // Default date if not provided
  const defaultDate = dateRange?.startDate
    ? new Date(dateRange.startDate)
    : new Date()

  for (const row of rows) {
    try {
      // Try to find existing record
      const existing = await prisma.keywordMetric.findFirst({
        where: {
          keyword: row.keyword,
          matchType: row.matchType,
          source: sourceMapping[source],
          date: row.date || defaultDate,
        },
      })

      if (existing) {
        // Update existing
        await prisma.keywordMetric.update({
          where: { id: existing.id },
          data: {
            impressions: row.impressions,
            clicks: row.clicks,
            ctr: row.ctr,
            spend: row.spend,
            cpc: row.cpc,
            orders: row.orders,
            sales: row.sales,
            roas: row.roas,
            conversionRate: row.conversionRate,
            acos: row.acos,
            metadata: (row.metadata || {}) as Prisma.InputJsonValue,
          },
        })
        updated++
      } else {
        // Create new
        await prisma.keywordMetric.create({
          data: {
            keyword: row.keyword,
            matchType: row.matchType,
            date: row.date || defaultDate,
            impressions: row.impressions,
            clicks: row.clicks,
            ctr: row.ctr,
            spend: row.spend,
            cpc: row.cpc,
            orders: row.orders,
            sales: row.sales,
            roas: row.roas,
            conversionRate: row.conversionRate,
            acos: row.acos,
            source: sourceMapping[source],
            metadata: (row.metadata || {}) as Prisma.InputJsonValue,
          },
        })
        created++
      }
    } catch (error) {
      console.error('Error processing row:', error)
      failed++
    }
  }

  return { created, updated, failed }
}

/**
 * Validate file before processing
 */
export function validateFile(
  file: { size: number; type?: string; name: string }
): { valid: boolean; error?: string; fileType?: FileType } {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    }
  }

  // Check file extension
  const fileType = detectFileType(file.name)
  if (!fileType) {
    return {
      valid: false,
      error: 'Only CSV and XLSX files are accepted',
    }
  }

  return { valid: true, fileType }
}

/**
 * Preview spreadsheet file (first N rows)
 */
export function previewFile(
  fileContent: string | ArrayBuffer,
  fileType: FileType = 'csv',
  rows = 5
): { headers: string[]; data: Record<string, string>[]; totalRows: number } {
  if (fileType === 'xlsx') {
    if (!(fileContent instanceof ArrayBuffer)) {
      return { headers: [], data: [], totalRows: 0 }
    }
    const result = parseXlsx(fileContent)
    return {
      headers: result.headers,
      data: result.data.slice(0, rows),
      totalRows: result.data.length,
    }
  } else {
    if (typeof fileContent !== 'string') {
      return { headers: [], data: [], totalRows: 0 }
    }
    const result = Papa.parse<Record<string, string>>(fileContent, {
      header: true,
      skipEmptyLines: true,
      preview: rows,
      transformHeader: (header) => header.trim(),
    })

    // Get total row count by parsing just for count
    const fullResult = Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
    })

    return {
      headers: result.meta.fields || [],
      data: result.data,
      totalRows: fullResult.data.length,
    }
  }
}
