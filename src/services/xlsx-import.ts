/**
 * XLSX Import Service
 * Handles parsing Excel files for inventory snapshot imports
 */

import * as XLSX from 'xlsx'

/**
 * Row data structure for inventory snapshot import
 */
export interface InventorySnapshotRow {
  itemName: string
  currentBalance: number
}

/**
 * Error structure for individual rows
 */
export interface RowError {
  rowNumber: number
  errors: string[]
}

/**
 * Result of parsing an inventory snapshot file
 */
export interface SnapshotParseResult {
  rows: InventorySnapshotRow[]
  dateFromFilename: Date | null
  errors: RowError[]
}

/**
 * Parse an XLSX file buffer into a 2D array of strings
 * @param buffer - ArrayBuffer containing the XLSX file data
 * @returns Array of rows, where each row is an array of cell values as strings
 */
export function parseXLSX(buffer: ArrayBuffer): string[][] {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]

  if (!firstSheetName) {
    return []
  }

  const sheet = workbook.Sheets[firstSheetName]
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: '',
    raw: false, // Convert all values to strings
  })

  return rows
}

/**
 * Generate a SKU code from an item name
 * Algorithm:
 * - Convert to uppercase
 * - Remove special characters (keep alphanumeric and spaces)
 * - Take first 4 characters of each word
 * - Join with dashes
 * - Limit total length to 20 characters
 *
 * Examples:
 * - "3pk IFU" -> "3PK-IFU"
 * - "Bubble Mailers" -> "BUBB-MAIL"
 * - "Large tools" -> "LARG-TOOL"
 *
 * @param itemName - The item name to convert
 * @returns Generated SKU code
 */
export function generateSkuCode(itemName: string): string {
  if (!itemName || itemName.trim() === '') {
    return ''
  }

  return itemName
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')  // Remove special chars
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0)
    .map(word => word.slice(0, 4))  // First 4 chars of each word
    .join('-')
    .slice(0, 20)  // Max 20 chars
}

/**
 * Extract a date from a filename
 * Looks for YYYY-MM-DD pattern anywhere in the filename
 *
 * Examples:
 * - "2025-11-13_TonsilTech_Inventory.xlsx" -> Date(2025-11-13)
 * - "inventory_2025-11-20_final.xlsx" -> Date(2025-11-20)
 * - "inventory.xlsx" -> null
 *
 * @param filename - The filename to parse
 * @returns Parsed Date or null if no date found
 */
export function extractDateFromFilename(filename: string): Date | null {
  const match = filename.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (match) {
    const dateStr = match[0]
    const date = new Date(dateStr + 'T00:00:00')
    if (!isNaN(date.getTime())) {
      return date
    }
  }
  return null
}

/**
 * Normalize a header string to a standard key
 * Maps common variations to standard keys:
 * - "item", "item name", "name", "product" -> "item"
 * - "current balance", "balance", "quantity", "qty", "on hand" -> "current_balance"
 *
 * @param header - The header string to normalize
 * @returns Normalized key or the original header in lowercase
 */
export function normalizeSnapshotHeader(header: string): string {
  const normalized = header
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')

  // Map variations to standard keys
  const itemVariations = ['item', 'item_name', 'name', 'product', 'product_name']
  const balanceVariations = ['current_balance', 'balance', 'quantity', 'qty', 'on_hand', 'onhand', 'count']

  if (itemVariations.includes(normalized)) {
    return 'item'
  }

  if (balanceVariations.includes(normalized)) {
    return 'current_balance'
  }

  return normalized
}

/**
 * Parse an inventory snapshot from an XLSX file
 *
 * @param buffer - ArrayBuffer containing the XLSX file data
 * @param filename - Original filename (used to extract date)
 * @returns Parsed result with valid rows, date from filename, and any errors
 */
export function parseInventorySnapshot(
  buffer: ArrayBuffer,
  filename: string
): SnapshotParseResult {
  const rawRows = parseXLSX(buffer)
  const dateFromFilename = extractDateFromFilename(filename)

  const result: SnapshotParseResult = {
    rows: [],
    dateFromFilename,
    errors: [],
  }

  if (rawRows.length < 2) {
    result.errors.push({
      rowNumber: 0,
      errors: ['File must contain a header row and at least one data row'],
    })
    return result
  }

  // Parse headers
  const headers = rawRows[0]
  const normalizedHeaders = headers.map(h => normalizeSnapshotHeader(String(h)))

  const itemIndex = normalizedHeaders.indexOf('item')
  const balanceIndex = normalizedHeaders.indexOf('current_balance')

  if (itemIndex === -1) {
    result.errors.push({
      rowNumber: 1,
      errors: ['Missing required column: Item (or Item Name, Name, Product)'],
    })
    return result
  }

  if (balanceIndex === -1) {
    result.errors.push({
      rowNumber: 1,
      errors: ['Missing required column: Current Balance (or Balance, Quantity, Qty, On Hand)'],
    })
    return result
  }

  // Parse data rows
  const dataRows = rawRows.slice(1)

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]
    const rowNumber = i + 2 // 1-indexed, +1 for header
    const rowErrors: string[] = []

    const itemName = String(row[itemIndex] ?? '').trim()
    const balanceStr = String(row[balanceIndex] ?? '').trim()

    // Validate item name
    if (!itemName) {
      rowErrors.push('Item name is required')
    }

    // Validate and parse balance
    let currentBalance = 0
    if (!balanceStr) {
      rowErrors.push('Current balance is required')
    } else {
      // Remove commas and parse as number
      const cleanedBalance = balanceStr.replace(/,/g, '')
      currentBalance = parseFloat(cleanedBalance)

      if (isNaN(currentBalance)) {
        rowErrors.push(`Invalid number for current balance: "${balanceStr}"`)
      } else if (currentBalance < 0) {
        rowErrors.push('Current balance cannot be negative')
      }
    }

    if (rowErrors.length > 0) {
      result.errors.push({
        rowNumber,
        errors: rowErrors,
      })
    } else {
      result.rows.push({
        itemName,
        currentBalance,
      })
    }
  }

  return result
}
