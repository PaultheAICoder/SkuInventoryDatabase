/**
 * Helium10 Keyword Export CSV Mapper
 *
 * Maps columns from Helium10 keyword research exports.
 */

import type { CsvMapper, KeywordMetricRow, ValidationResult } from '../types'

// Expected column headers from Helium10 export
const REQUIRED_COLUMNS = [
  'Keyword',
]

const OPTIONAL_COLUMNS = [
  'Search Volume',
  'Search Volume Trend',
  'Competing Products',
  'Cerebro IQ Score',
  'Title Density',
  'CPR',
  'Opportunity Score',
]

function parseInteger(value: string): number {
  if (!value) return 0
  const num = parseInt(value.replace(/,/g, '').trim(), 10)
  return isNaN(num) ? 0 : num
}

function parseDecimal(value: string): number | undefined {
  if (!value) return undefined
  const num = parseFloat(value.replace(/,/g, '').trim())
  return isNaN(num) ? undefined : num
}

export const helium10Mapper: CsvMapper = {
  source: 'helium10',
  requiredColumns: REQUIRED_COLUMNS,
  optionalColumns: OPTIONAL_COLUMNS,

  mappings: [
    { sourceColumn: 'Keyword', targetField: 'keyword' },
  ],

  validateRow(row: Record<string, string>): ValidationResult {
    const errors: string[] = []

    const keyword = row['Keyword']?.trim()
    if (!keyword) {
      errors.push('Keyword is required')
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  },

  transformRow(row: Record<string, string>): KeywordMetricRow {
    const keyword = row['Keyword']?.trim() || ''

    // Helium10 provides research data, not performance metrics
    // Store in metadata for reference
    return {
      keyword,
      matchType: 'broad', // Default for research keywords
      impressions: 0,
      clicks: 0,
      spend: 0,
      orders: 0,
      sales: 0,
      metadata: {
        source: 'helium10',
        searchVolume: parseInteger(row['Search Volume']),
        searchVolumeTrend: row['Search Volume Trend']?.trim(),
        competingProducts: parseInteger(row['Competing Products']),
        cerebroIqScore: parseDecimal(row['Cerebro IQ Score']),
        titleDensity: parseDecimal(row['Title Density']),
        cpr: parseInteger(row['CPR']),
        opportunityScore: parseDecimal(row['Opportunity Score']),
      },
    }
  },
}
