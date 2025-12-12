/**
 * ZonGuru Keyword Export CSV Mapper
 *
 * Maps columns from ZonGuru keyword research exports.
 */

import type { CsvMapper, KeywordMetricRow, ValidationResult } from '../types'

// Expected column headers from ZonGuru export
const REQUIRED_COLUMNS = [
  'Keyword',
]

const OPTIONAL_COLUMNS = [
  'Search Volume',
  'Competition',
  'Opportunity Score',
  'CPR',
  'Title Density',
  'Relevancy Score',
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

export const zonguruMapper: CsvMapper = {
  source: 'zonguru',
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

    // ZonGuru provides research data, not performance metrics
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
        source: 'zonguru',
        searchVolume: parseInteger(row['Search Volume']),
        competition: row['Competition']?.trim(),
        opportunityScore: parseDecimal(row['Opportunity Score']),
        cpr: parseInteger(row['CPR']),
        titleDensity: parseDecimal(row['Title Density']),
        relevancyScore: parseDecimal(row['Relevancy Score']),
      },
    }
  },
}
