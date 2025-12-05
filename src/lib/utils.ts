import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parse a fraction string (e.g., "1/45") or decimal number to a numeric value.
 * Returns null if the input is invalid.
 */
export function parseFractionOrNumber(input: string): number | null {
  if (!input || typeof input !== 'string') {
    return null
  }

  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }

  // Check if it's a fraction (contains /)
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/')
    if (parts.length !== 2) {
      return null
    }

    const numerator = parseFloat(parts[0].trim())
    const denominator = parseFloat(parts[1].trim())

    if (isNaN(numerator) || isNaN(denominator) || denominator === 0) {
      return null
    }

    return numerator / denominator
  }

  // Otherwise, parse as a regular number
  const num = parseFloat(trimmed)
  return isNaN(num) ? null : num
}
