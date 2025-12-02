/**
 * CSV Import Service
 * Handles parsing and validating CSV files for component and SKU imports
 */

import { z } from 'zod'
import { createComponentSchema } from '@/types/component'
import { createSKUSchema } from '@/types/sku'

export interface ImportResult<T> {
  success: boolean
  rowNumber: number
  data: T | null
  errors: string[]
}

export interface ImportSummary<T> {
  total: number
  successful: number
  failed: number
  results: ImportResult<T>[]
}

/**
 * Parse CSV string into array of rows
 */
export function parseCSV(csvContent: string): string[][] {
  const lines = csvContent.split(/\r?\n/).filter((line) => line.trim())
  const result: string[][] = []

  for (const line of lines) {
    const row: string[] = []
    let field = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      const nextChar = line[i + 1]

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          // Escaped quote
          field += '"'
          i++
        } else if (char === '"') {
          // End of quoted field
          inQuotes = false
        } else {
          field += char
        }
      } else {
        if (char === '"') {
          // Start of quoted field
          inQuotes = true
        } else if (char === ',') {
          // End of field
          row.push(field.trim())
          field = ''
        } else {
          field += char
        }
      }
    }

    // Add last field
    row.push(field.trim())
    result.push(row)
  }

  return result
}

/**
 * Map CSV headers to expected field names
 */
function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

/**
 * Create a record from CSV row using header mapping
 */
function rowToRecord(headers: string[], row: string[]): Record<string, string> {
  const record: Record<string, string> = {}
  for (let i = 0; i < headers.length; i++) {
    const key = normalizeHeader(headers[i])
    record[key] = row[i] ?? ''
  }
  return record
}

// Component import schema with CSV field mappings
const componentImportSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  sku_code: z.string().min(1, 'SKU code is required'),
  category: z.string().optional().transform((v) => v || null),
  unit_of_measure: z.string().optional().default('each'),
  cost_per_unit: z.string().optional().transform((v) => (v ? parseFloat(v) : 0)),
  reorder_point: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 0)),
  lead_time_days: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 0)),
  notes: z.string().optional().transform((v) => v || null),
})

// SKU import schema with CSV field mappings
const skuImportSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  internal_code: z.string().min(1, 'Internal code is required'),
  sales_channel: z.enum(['Amazon', 'Shopify', 'TikTok', 'Generic']),
  notes: z.string().optional().transform((v) => v || null),
})

// Initial inventory import schema with CSV field mappings
const initialInventoryImportSchema = z.object({
  component_sku_code: z.string().min(1, 'Component SKU code is required'),
  quantity: z.string().min(1, 'Quantity is required').transform((v) => {
    const num = parseFloat(v)
    if (isNaN(num) || num <= 0) {
      throw new Error('Quantity must be a positive number')
    }
    return num
  }),
  cost_per_unit: z.string().optional().transform((v) => {
    if (!v || v.trim() === '') return undefined
    const num = parseFloat(v)
    if (isNaN(num) || num < 0) {
      throw new Error('Cost per unit must be a non-negative number')
    }
    return num
  }),
  date: z.string().optional().transform((v) => {
    if (!v || v.trim() === '') return new Date()
    const date = new Date(v)
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date format')
    }
    return date
  }),
  notes: z.string().optional().transform((v) => v || null),
})

/**
 * Import component from CSV row
 */
function importComponentRow(
  record: Record<string, string>,
  rowNumber: number
): ImportResult<z.infer<typeof createComponentSchema>> {
  try {
    // Parse with CSV field schema first
    const csvParsed = componentImportSchema.parse(record)

    // Transform to API schema
    const componentData = {
      name: csvParsed.name,
      skuCode: csvParsed.sku_code,
      category: csvParsed.category,
      unitOfMeasure: csvParsed.unit_of_measure,
      costPerUnit: csvParsed.cost_per_unit,
      reorderPoint: csvParsed.reorder_point,
      leadTimeDays: csvParsed.lead_time_days,
      notes: csvParsed.notes,
    }

    // Validate with actual API schema
    const validated = createComponentSchema.parse(componentData)

    return {
      success: true,
      rowNumber,
      data: validated,
      errors: [],
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return {
        success: false,
        rowNumber,
        data: null,
        errors: err.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
      }
    }
    return {
      success: false,
      rowNumber,
      data: null,
      errors: [err instanceof Error ? err.message : 'Unknown error'],
    }
  }
}

/**
 * Import SKU from CSV row
 */
function importSKURow(
  record: Record<string, string>,
  rowNumber: number
): ImportResult<z.infer<typeof createSKUSchema>> {
  try {
    // Parse with CSV field schema first
    const csvParsed = skuImportSchema.parse(record)

    // Transform to API schema
    const skuData = {
      name: csvParsed.name,
      internalCode: csvParsed.internal_code,
      salesChannel: csvParsed.sales_channel as 'Amazon' | 'Shopify' | 'TikTok' | 'Generic',
      externalIds: {},
      notes: csvParsed.notes,
    }

    // Validate with actual API schema
    const validated = createSKUSchema.parse(skuData)

    return {
      success: true,
      rowNumber,
      data: validated,
      errors: [],
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return {
        success: false,
        rowNumber,
        data: null,
        errors: err.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
      }
    }
    return {
      success: false,
      rowNumber,
      data: null,
      errors: [err instanceof Error ? err.message : 'Unknown error'],
    }
  }
}

export interface InitialInventoryRowData {
  componentSkuCode: string
  quantity: number
  costPerUnit?: number
  date: Date
  notes: string | null
}

/**
 * Import initial inventory row from CSV
 */
function importInitialInventoryRow(
  record: Record<string, string>,
  rowNumber: number
): ImportResult<InitialInventoryRowData> {
  try {
    const csvParsed = initialInventoryImportSchema.parse(record)

    const rowData: InitialInventoryRowData = {
      componentSkuCode: csvParsed.component_sku_code,
      quantity: csvParsed.quantity,
      costPerUnit: csvParsed.cost_per_unit,
      date: csvParsed.date,
      notes: csvParsed.notes,
    }

    return {
      success: true,
      rowNumber,
      data: rowData,
      errors: [],
    }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return {
        success: false,
        rowNumber,
        data: null,
        errors: err.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
      }
    }
    return {
      success: false,
      rowNumber,
      data: null,
      errors: [err instanceof Error ? err.message : 'Unknown error'],
    }
  }
}

/**
 * Process CSV content for component import
 */
export function processComponentImport(
  csvContent: string
): ImportSummary<z.infer<typeof createComponentSchema>> {
  const rows = parseCSV(csvContent)

  if (rows.length < 2) {
    return {
      total: 0,
      successful: 0,
      failed: 0,
      results: [],
    }
  }

  const headers = rows[0]
  const dataRows = rows.slice(1)

  const results = dataRows.map((row, index) => {
    const record = rowToRecord(headers, row)
    return importComponentRow(record, index + 2) // +2 because 1-indexed and skip header
  })

  return {
    total: results.length,
    successful: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  }
}

/**
 * Process CSV content for SKU import
 */
export function processSKUImport(
  csvContent: string
): ImportSummary<z.infer<typeof createSKUSchema>> {
  const rows = parseCSV(csvContent)

  if (rows.length < 2) {
    return {
      total: 0,
      successful: 0,
      failed: 0,
      results: [],
    }
  }

  const headers = rows[0]
  const dataRows = rows.slice(1)

  const results = dataRows.map((row, index) => {
    const record = rowToRecord(headers, row)
    return importSKURow(record, index + 2) // +2 because 1-indexed and skip header
  })

  return {
    total: results.length,
    successful: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  }
}

/**
 * Process CSV content for initial inventory import
 */
export function processInitialInventoryImport(
  csvContent: string
): ImportSummary<InitialInventoryRowData> {
  const rows = parseCSV(csvContent)

  if (rows.length < 2) {
    return {
      total: 0,
      successful: 0,
      failed: 0,
      results: [],
    }
  }

  const headers = rows[0]
  const dataRows = rows.slice(1)

  const results = dataRows.map((row, index) => {
    const record = rowToRecord(headers, row)
    return importInitialInventoryRow(record, index + 2) // +2 because 1-indexed and skip header
  })

  return {
    total: results.length,
    successful: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  }
}

/**
 * Generate CSV template for components
 */
export function generateComponentTemplate(): string {
  const headers = [
    'Name',
    'SKU Code',
    'Category',
    'Unit of Measure',
    'Cost Per Unit',
    'Reorder Point',
    'Lead Time (Days)',
    'Notes',
  ]

  const exampleRow = [
    'Example Component',
    'COMP-001',
    'Electronics',
    'each',
    '10.50',
    '100',
    '7',
    'Sample component for import',
  ]

  return [headers.join(','), exampleRow.join(',')].join('\n')
}

/**
 * Generate CSV template for SKUs
 */
export function generateSKUTemplate(): string {
  const headers = ['Name', 'Internal Code', 'Sales Channel', 'Notes']

  const exampleRow = ['Example SKU', 'SKU-001', 'Amazon', 'Sample SKU for import']

  return [headers.join(','), exampleRow.join(',')].join('\n')
}

/**
 * Generate CSV template for initial inventory import
 */
export function generateInitialInventoryTemplate(): string {
  const headers = [
    'Component SKU Code',
    'Quantity',
    'Cost Per Unit',
    'Date',
    'Notes',
  ]

  const exampleRow = [
    'COMP-001',
    '100',
    '10.50',
    '2025-01-01',
    'Opening balance',
  ]

  return [headers.join(','), exampleRow.join(',')].join('\n')
}
