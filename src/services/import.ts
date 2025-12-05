/**
 * CSV Import Service
 * Handles parsing and validating CSV files for component and SKU imports
 */

import { z } from 'zod'

export interface ImportResult<T> {
  success: boolean
  rowNumber: number
  data: T | null
  errors: string[]
}

/**
 * Reference data for template generation
 */
export interface TemplateReferenceData {
  companies: { name: string }[]
  brands: { name: string; companyName: string }[]
  locations: { name: string; companyName: string }[]
  categories: { name: string }[]
  components?: { skuCode: string; name: string; costPerUnit: string }[]
}

/**
 * Component import data with lookup fields
 */
export interface ComponentImportWithLookups {
  name: string
  skuCode: string
  company?: string // Company name for lookup
  brand?: string // Brand name for lookup
  location?: string // Location name for lookup (optional)
  category: string | null
  unitOfMeasure: string
  costPerUnit: number
  reorderPoint: number
  leadTimeDays: number
  notes: string | null
}

/**
 * SKU import data with lookup fields
 */
export interface SKUImportWithLookups {
  name: string
  internalCode: string
  company?: string // Company name for lookup
  brand?: string // Brand name for lookup
  salesChannel: 'Amazon' | 'Shopify' | 'TikTok' | 'Generic'
  notes: string | null
  // BOM component pairs (up to 5)
  bomComponents?: Array<{
    componentSkuCode: string
    quantity: number
  }>
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
  company: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  brand: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  location: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  category: z
    .string()
    .optional()
    .transform((v) => v || null),
  unit_of_measure: z.string().optional().default('each'),
  cost_per_unit: z
    .string()
    .optional()
    .transform((v) => (v ? parseFloat(v) : 0)),
  reorder_point: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 0)),
  lead_time_days: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 0)),
  notes: z
    .string()
    .optional()
    .transform((v) => v || null),
})

// Helper to create BOM column schemas (5 component pairs)
function createBomColumnSchemas(): Record<string, z.ZodTypeAny> {
  const schemas: Record<string, z.ZodTypeAny> = {}
  for (let i = 1; i <= 5; i++) {
    schemas[`bom_component_${i}`] = z.string().optional().transform((v) => v || undefined)
    schemas[`bom_qty_${i}`] = z.string().optional().transform((v) => v ? parseFloat(v) : undefined)
  }
  return schemas
}

// SKU import schema with CSV field mappings
const skuImportSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  internal_code: z.string().min(1, 'Internal code is required'),
  company: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  brand: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  sales_channel: z.enum(['Amazon', 'Shopify', 'TikTok', 'Generic']),
  notes: z
    .string()
    .optional()
    .transform((v) => v || null),
  // BOM columns (1-5)
  ...createBomColumnSchemas(),
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
  // Optional company/brand columns
  company: z.string().optional().transform((v) => v || undefined),
  brand: z.string().optional().transform((v) => v || undefined),
})

/**
 * Import component from CSV row
 * Returns ComponentImportWithLookups with lookup fields for API route to resolve
 */
function importComponentRow(
  record: Record<string, string>,
  rowNumber: number
): ImportResult<ComponentImportWithLookups> {
  try {
    // Parse with CSV field schema first
    const csvParsed = componentImportSchema.parse(record)

    // Transform to data with lookup fields
    const componentData: ComponentImportWithLookups = {
      name: csvParsed.name,
      skuCode: csvParsed.sku_code,
      company: csvParsed.company,
      brand: csvParsed.brand,
      location: csvParsed.location,
      category: csvParsed.category,
      unitOfMeasure: csvParsed.unit_of_measure,
      costPerUnit: csvParsed.cost_per_unit,
      reorderPoint: csvParsed.reorder_point,
      leadTimeDays: csvParsed.lead_time_days,
      notes: csvParsed.notes,
    }

    return {
      success: true,
      rowNumber,
      data: componentData,
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
 * Returns SKUImportWithLookups with lookup fields for API route to resolve
 */
function importSKURow(
  record: Record<string, string>,
  rowNumber: number
): ImportResult<SKUImportWithLookups> {
  try {
    // Parse with CSV field schema first
    const csvParsed = skuImportSchema.parse(record)

    // Extract BOM components from parsed data
    const bomComponents: Array<{ componentSkuCode: string; quantity: number }> = []
    for (let i = 1; i <= 5; i++) {
      const skuCode = csvParsed[`bom_component_${i}` as keyof typeof csvParsed] as string | undefined
      const qty = csvParsed[`bom_qty_${i}` as keyof typeof csvParsed] as number | undefined
      if (skuCode && qty && !isNaN(qty)) {
        bomComponents.push({
          componentSkuCode: skuCode,
          quantity: qty,
        })
      }
    }

    // Transform to data with lookup fields
    const skuData: SKUImportWithLookups = {
      name: csvParsed.name,
      internalCode: csvParsed.internal_code,
      company: csvParsed.company,
      brand: csvParsed.brand,
      salesChannel: csvParsed.sales_channel,
      notes: csvParsed.notes,
      bomComponents: bomComponents.length > 0 ? bomComponents : undefined,
    }

    return {
      success: true,
      rowNumber,
      data: skuData,
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
  company?: string   // Optional company name for lookup
  brand?: string     // Optional brand name for lookup
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
      company: csvParsed.company,
      brand: csvParsed.brand,
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
): ImportSummary<ComponentImportWithLookups> {
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
): ImportSummary<SKUImportWithLookups> {
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
 * Optionally includes reference data section with valid companies, brands, locations, categories
 */
export function generateComponentTemplate(referenceData?: TemplateReferenceData): string {
  const headers = [
    'Name',
    'SKU Code',
    'Company',
    'Brand',
    'Location',
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
    referenceData?.companies[0]?.name || 'Company Name',
    referenceData?.brands[0]?.name || 'Brand Name',
    referenceData?.locations[0]?.name || '',
    'Electronics',
    'each',
    '10.50',
    '100',
    '7',
    'Sample component for import',
  ]

  const lines = [headers.join(','), exampleRow.join(',')]

  // Add reference section if data provided
  if (referenceData) {
    lines.push('')
    lines.push('# === VALID OPTIONS REFERENCE (delete these lines before importing) ===')
    lines.push('#')
    lines.push('# COMPANIES:')
    for (const company of referenceData.companies) {
      lines.push(`#   ${company.name}`)
    }
    lines.push('#')
    lines.push('# BRANDS (Company -> Brand):')
    for (const brand of referenceData.brands) {
      lines.push(`#   ${brand.companyName} -> ${brand.name}`)
    }
    lines.push('#')
    lines.push('# LOCATIONS (Company -> Location):')
    for (const location of referenceData.locations) {
      lines.push(`#   ${location.companyName} -> ${location.name}`)
    }
    lines.push('#')
    lines.push('# CATEGORIES:')
    for (const category of referenceData.categories) {
      lines.push(`#   ${category.name}`)
    }
    lines.push('# ===================================================================')
  }

  return lines.join('\n')
}

/**
 * Generate CSV template for SKUs
 * Optionally includes reference data section with valid companies, brands, and components
 */
export function generateSKUTemplate(referenceData?: TemplateReferenceData): string {
  const headers = [
    'Name',
    'Internal Code',
    'Company',
    'Brand',
    'Sales Channel',
    'BOM Component 1',
    'BOM Qty 1',
    'BOM Component 2',
    'BOM Qty 2',
    'BOM Component 3',
    'BOM Qty 3',
    'BOM Component 4',
    'BOM Qty 4',
    'BOM Component 5',
    'BOM Qty 5',
    'Notes',
  ]

  const exampleRow = [
    'Example SKU',
    'SKU-001',
    referenceData?.companies[0]?.name || 'Company Name',
    referenceData?.brands[0]?.name || 'Brand Name',
    'Amazon',
    referenceData?.components?.[0]?.skuCode || '', // BOM Component 1
    referenceData?.components?.[0] ? '1' : '', // BOM Qty 1
    '', // BOM Component 2
    '', // BOM Qty 2
    '', // BOM Component 3
    '', // BOM Qty 3
    '', // BOM Component 4
    '', // BOM Qty 4
    '', // BOM Component 5
    '', // BOM Qty 5
    'Sample SKU for import',
  ]

  const lines = [headers.join(','), exampleRow.join(',')]

  // Add reference section if data provided
  if (referenceData) {
    lines.push('')
    lines.push('# === VALID OPTIONS REFERENCE (delete these lines before importing) ===')
    lines.push('#')
    lines.push('# COMPANIES:')
    for (const company of referenceData.companies) {
      lines.push(`#   ${company.name}`)
    }
    lines.push('#')
    lines.push('# BRANDS (Company -> Brand):')
    for (const brand of referenceData.brands) {
      lines.push(`#   ${brand.companyName} -> ${brand.name}`)
    }
    lines.push('#')
    lines.push('# SALES CHANNELS:')
    lines.push('#   Amazon, Shopify, TikTok, Generic')
    // Add COMPONENTS section if components are available
    if (referenceData.components && referenceData.components.length > 0) {
      lines.push('#')
      lines.push('# COMPONENTS (SKU Code -> Name [Cost]):')
      for (const component of referenceData.components) {
        lines.push(`#   ${component.skuCode} -> ${component.name} [$${component.costPerUnit}]`)
      }
    }
    lines.push('# ===================================================================')
  }

  return lines.join('\n')
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
    'Company',
    'Brand',
  ]

  const exampleRow = [
    'COMP-001',
    '100',
    '10.50',
    '2025-01-01',
    'Opening balance',
    '',  // Company (optional)
    '',  // Brand (optional)
  ]

  return [headers.join(','), exampleRow.join(',')].join('\n')
}
