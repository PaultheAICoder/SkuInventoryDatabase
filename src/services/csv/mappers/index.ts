/**
 * CSV Mapper Registry
 *
 * Selects appropriate mapper by source type.
 */

import type { CsvMapper, CsvSource } from '../types'
import { amazonSearchTermMapper } from './amazon-search-term'
import { zonguruMapper } from './zonguru'
import { helium10Mapper } from './helium10'

const mappers: Record<CsvSource, CsvMapper> = {
  amazon_search_term: amazonSearchTermMapper,
  zonguru: zonguruMapper,
  helium10: helium10Mapper,
}

/**
 * Get mapper for a CSV source type
 */
export function getMapper(source: CsvSource): CsvMapper {
  const mapper = mappers[source]
  if (!mapper) {
    throw new Error(`Unknown CSV source: ${source}`)
  }
  return mapper
}

/**
 * Get all supported source types
 */
export function getSupportedSources(): CsvSource[] {
  return Object.keys(mappers) as CsvSource[]
}

/**
 * Check if a source type is supported
 */
export function isSourceSupported(source: string): source is CsvSource {
  return source in mappers
}

/**
 * Validate CSV headers against expected columns for a source
 */
export function validateHeaders(
  source: CsvSource,
  headers: string[]
): { valid: boolean; missingRequired: string[]; missingOptional: string[] } {
  const mapper = getMapper(source)
  const normalizedHeaders = headers.map(h => h.trim())

  const missingRequired = mapper.requiredColumns.filter(
    col => !normalizedHeaders.includes(col)
  )

  const missingOptional = mapper.optionalColumns.filter(
    col => !normalizedHeaders.includes(col)
  )

  return {
    valid: missingRequired.length === 0,
    missingRequired,
    missingOptional,
  }
}

export { amazonSearchTermMapper, zonguruMapper, helium10Mapper }
