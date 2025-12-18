import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parse a date string ensuring local timezone interpretation.
 *
 * IMPORTANT: JavaScript's new Date("YYYY-MM-DD") parses as UTC midnight,
 * which can shift the date by -1 day for users west of UTC.
 * By appending "T00:00:00", we force local timezone interpretation.
 *
 * @param value - Date string (YYYY-MM-DD) or Date object
 * @returns Date object in local timezone
 */
export function parseLocalDate(value: string | Date): Date {
  if (value instanceof Date) {
    return value
  }

  // If no time component, append T00:00:00 to force local timezone
  const dateString = value.includes('T') ? value : `${value}T00:00:00`
  return new Date(dateString)
}

/**
 * Format a date string for display, ensuring correct timezone interpretation.
 *
 * IMPORTANT: JavaScript's new Date("YYYY-MM-DD") parses as UTC midnight,
 * which can shift the date by -1 day for users west of UTC when displayed.
 * By appending "T00:00:00", we force local timezone interpretation.
 *
 * @param dateStr - Date string (YYYY-MM-DD or ISO timestamp)
 * @param options - Intl.DateTimeFormatOptions for formatting
 * @returns Formatted date string in user's locale
 */
export function formatDateString(
  dateStr: string,
  options?: Intl.DateTimeFormatOptions
): string {
  // If no time component, append T00:00:00 to force local timezone
  const dateString = dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', options)
}

/**
 * Convert a Date object to a YYYY-MM-DD string in local timezone.
 *
 * IMPORTANT: This replaces `.toISOString().split('T')[0]` which converts to UTC
 * and can shift the date by -1 day for users west of UTC.
 *
 * @param date - Date object to format
 * @returns String in YYYY-MM-DD format (local timezone)
 */
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Get the user's role for their currently selected company (client-side version).
 * Returns the role from the companies array based on selectedCompanyId.
 * This is the correct source for permission checks in multi-tenant context.
 *
 * @param user - User object from useSession (must have companies and selectedCompanyId)
 * @returns The role for the selected company, or undefined if not found
 */
export function getClientCompanyRole(
  user: { companies: Array<{ id: string; role?: string }>; selectedCompanyId: string } | null | undefined
): 'admin' | 'ops' | 'viewer' | undefined {
  if (!user) return undefined
  const company = user.companies.find((c) => c.id === user.selectedCompanyId)
  return company?.role as 'admin' | 'ops' | 'viewer' | undefined
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
