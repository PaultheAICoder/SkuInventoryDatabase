/**
 * Amazon Search Term Report CSV Mapper
 *
 * Maps columns from Amazon Ads search term report CSV exports.
 */

import type { CsvMapper, KeywordMetricRow, ValidationResult } from '../types'

// Expected column headers from Amazon search term report
const REQUIRED_COLUMNS = [
  'Customer Search Term',
  'Impressions',
  'Clicks',
  'Spend',
]

const OPTIONAL_COLUMNS = [
  'Campaign Name',
  'Ad Group Name',
  'Targeting',
  'Match Type',
  'Click-Thru Rate (CTR)',
  'Cost Per Click (CPC)',
  '7 Day Total Sales',
  '7 Day Total Orders (#)',
  'Total Advertising Cost of Sales (ACoS)',
  'Total Return on Advertising Spend (RoAS)',
  '7 Day Conversion Rate',
]

// Parse percentages like "3.00%" to decimal 0.03
function parsePercentage(value: string): number | undefined {
  if (!value) return undefined
  const match = value.replace('%', '').trim()
  const num = parseFloat(match)
  return isNaN(num) ? undefined : num / 100
}

// Parse currency like "$38.25" to number 38.25
function parseCurrency(value: string): number {
  if (!value) return 0
  const num = parseFloat(value.replace(/[$,]/g, '').trim())
  return isNaN(num) ? 0 : num
}

// Parse integers
function parseInteger(value: string): number {
  if (!value) return 0
  const num = parseInt(value.replace(/,/g, '').trim(), 10)
  return isNaN(num) ? 0 : num
}

// Map match type to standard format
function normalizeMatchType(matchType: string | undefined): KeywordMetricRow['matchType'] {
  if (!matchType) return 'auto'
  const lower = matchType.toLowerCase().trim()
  if (lower === 'exact') return 'exact'
  if (lower === 'phrase') return 'phrase'
  if (lower === 'broad') return 'broad'
  if (lower === 'auto' || lower === 'automatic') return 'auto'
  return 'auto'
}

export const amazonSearchTermMapper: CsvMapper = {
  source: 'amazon_search_term',
  requiredColumns: REQUIRED_COLUMNS,
  optionalColumns: OPTIONAL_COLUMNS,

  mappings: [
    { sourceColumn: 'Customer Search Term', targetField: 'keyword' },
    { sourceColumn: 'Campaign Name', targetField: 'campaignName' },
    { sourceColumn: 'Ad Group Name', targetField: 'adGroupName' },
    { sourceColumn: 'Impressions', targetField: 'impressions', transform: parseInteger },
    { sourceColumn: 'Clicks', targetField: 'clicks', transform: parseInteger },
    { sourceColumn: 'Spend', targetField: 'spend', transform: parseCurrency },
    { sourceColumn: '7 Day Total Orders (#)', targetField: 'orders', transform: parseInteger },
    { sourceColumn: '7 Day Total Sales', targetField: 'sales', transform: parseCurrency },
  ],

  validateRow(row: Record<string, string>): ValidationResult {
    const errors: string[] = []

    // Check required fields
    const keyword = row['Customer Search Term']?.trim()
    if (!keyword) {
      errors.push('Customer Search Term is required')
    }

    const impressions = row['Impressions']
    if (impressions !== undefined && impressions !== '' && isNaN(parseInteger(impressions))) {
      errors.push('Impressions must be a number')
    }

    const clicks = row['Clicks']
    if (clicks !== undefined && clicks !== '' && isNaN(parseInteger(clicks))) {
      errors.push('Clicks must be a number')
    }

    const spend = row['Spend']
    if (!spend) {
      errors.push('Spend is required')
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  },

  transformRow(row: Record<string, string>): KeywordMetricRow {
    const keyword = row['Customer Search Term']?.trim() || ''
    const matchType = normalizeMatchType(row['Match Type'] || row['Targeting'])

    const impressions = parseInteger(row['Impressions'])
    const clicks = parseInteger(row['Clicks'])
    const spend = parseCurrency(row['Spend'])
    const orders = parseInteger(row['7 Day Total Orders (#)'])
    const sales = parseCurrency(row['7 Day Total Sales'])

    // Calculate derived metrics if not provided
    const ctr = row['Click-Thru Rate (CTR)']
      ? parsePercentage(row['Click-Thru Rate (CTR)'])
      : impressions > 0 ? clicks / impressions : undefined

    const cpc = row['Cost Per Click (CPC)']
      ? parseCurrency(row['Cost Per Click (CPC)'])
      : clicks > 0 ? spend / clicks : undefined

    const acos = row['Total Advertising Cost of Sales (ACoS)']
      ? parsePercentage(row['Total Advertising Cost of Sales (ACoS)'])
      : sales > 0 ? spend / sales : undefined

    const roas = row['Total Return on Advertising Spend (RoAS)']
      ? parseFloat(row['Total Return on Advertising Spend (RoAS)'])
      : spend > 0 ? sales / spend : undefined

    const conversionRate = row['7 Day Conversion Rate']
      ? parsePercentage(row['7 Day Conversion Rate'])
      : clicks > 0 ? orders / clicks : undefined

    return {
      keyword,
      matchType,
      campaignName: row['Campaign Name']?.trim(),
      adGroupName: row['Ad Group Name']?.trim(),
      impressions,
      clicks,
      ctr,
      spend,
      cpc,
      orders,
      sales,
      roas,
      acos,
      conversionRate,
      metadata: {
        targeting: row['Targeting'],
        originalMatchType: row['Match Type'],
      },
    }
  },
}
