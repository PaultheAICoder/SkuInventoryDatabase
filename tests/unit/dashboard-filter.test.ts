import { describe, it, expect } from 'vitest'

// Test dashboard date filtering logic
// These are pure function tests - no database required

/**
 * Helper function that mirrors the date calculation
 * from /api/dashboard/route.ts for testing
 */
function calculateStartDate(days: number | null): Date | null {
  if (days === null) {
    return null
  }
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

/**
 * Helper to check if a date is within the filter range
 */
function isDateInRange(date: Date, startDate: Date | null): boolean {
  if (startDate === null) {
    return true // No filter, all dates pass
  }
  return date >= startDate
}

describe('Dashboard Date Filtering', () => {
  describe('Start Date Calculation', () => {
    it('should calculate correct start date for 7 days', () => {
      const days = 7
      const startDate = calculateStartDate(days)

      expect(startDate).not.toBeNull()

      const now = Date.now()
      const expectedMs = days * 24 * 60 * 60 * 1000
      const actualDiffMs = now - startDate!.getTime()

      // Allow 1 second tolerance for timing
      expect(actualDiffMs).toBeGreaterThanOrEqual(expectedMs - 1000)
      expect(actualDiffMs).toBeLessThanOrEqual(expectedMs + 1000)
    })

    it('should calculate correct start date for 30 days', () => {
      const days = 30
      const startDate = calculateStartDate(days)

      expect(startDate).not.toBeNull()

      const now = Date.now()
      const expectedMs = days * 24 * 60 * 60 * 1000
      const actualDiffMs = now - startDate!.getTime()

      // Allow 1 second tolerance for timing
      expect(actualDiffMs).toBeGreaterThanOrEqual(expectedMs - 1000)
      expect(actualDiffMs).toBeLessThanOrEqual(expectedMs + 1000)
    })

    it('should calculate correct start date for 90 days', () => {
      const days = 90
      const startDate = calculateStartDate(days)

      expect(startDate).not.toBeNull()

      const now = Date.now()
      const expectedMs = days * 24 * 60 * 60 * 1000
      const actualDiffMs = now - startDate!.getTime()

      // Allow 1 second tolerance for timing
      expect(actualDiffMs).toBeGreaterThanOrEqual(expectedMs - 1000)
      expect(actualDiffMs).toBeLessThanOrEqual(expectedMs + 1000)
    })

    it('should return null for no days parameter', () => {
      const startDate = calculateStartDate(null)
      expect(startDate).toBeNull()
    })

    it('should return null for undefined days', () => {
      // TypeScript wouldn't normally allow undefined, but testing edge case
      const daysParam = undefined as unknown as number | null
      const startDate = calculateStartDate(daysParam ?? null)
      expect(startDate).toBeNull()
    })
  })

  describe('Date Range Filtering', () => {
    it('should pass dates within 7-day range', () => {
      const startDate = calculateStartDate(7)
      const recentDate = new Date()
      recentDate.setDate(recentDate.getDate() - 3) // 3 days ago

      expect(isDateInRange(recentDate, startDate)).toBe(true)
    })

    it('should fail dates outside 7-day range', () => {
      const startDate = calculateStartDate(7)
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 10) // 10 days ago

      expect(isDateInRange(oldDate, startDate)).toBe(false)
    })

    it('should pass all dates when no filter', () => {
      const startDate = calculateStartDate(null)
      const veryOldDate = new Date()
      veryOldDate.setFullYear(veryOldDate.getFullYear() - 5) // 5 years ago

      expect(isDateInRange(veryOldDate, startDate)).toBe(true)
    })

    it('should pass exact boundary date', () => {
      const days = 30
      const startDate = calculateStartDate(days)!
      // Date exactly at the boundary
      expect(isDateInRange(startDate, startDate)).toBe(true)
    })

    it('should pass today with any filter', () => {
      const today = new Date()

      expect(isDateInRange(today, calculateStartDate(7))).toBe(true)
      expect(isDateInRange(today, calculateStartDate(30))).toBe(true)
      expect(isDateInRange(today, calculateStartDate(90))).toBe(true)
      expect(isDateInRange(today, calculateStartDate(null))).toBe(true)
    })
  })

  describe('Query Parameter Parsing', () => {
    it('should parse valid numeric string to number', () => {
      const daysParam = '7'
      const days = daysParam ? parseInt(daysParam, 10) : null
      expect(days).toBe(7)
    })

    it('should return null for empty string', () => {
      const daysParam = ''
      const days = daysParam ? parseInt(daysParam, 10) : null
      expect(days).toBeNull()
    })

    it('should handle string "30" correctly', () => {
      const daysParam = '30'
      const days = daysParam ? parseInt(daysParam, 10) : null
      expect(days).toBe(30)
    })

    it('should handle string "90" correctly', () => {
      const daysParam = '90'
      const days = daysParam ? parseInt(daysParam, 10) : null
      expect(days).toBe(90)
    })

    it('should handle null parameter', () => {
      const daysParam = null
      const days = daysParam ? parseInt(daysParam, 10) : null
      expect(days).toBeNull()
    })
  })

  describe('Edge Cases', () => {
    it('should handle 1 day filter', () => {
      const startDate = calculateStartDate(1)
      expect(startDate).not.toBeNull()

      // Today should pass
      expect(isDateInRange(new Date(), startDate)).toBe(true)

      // 2 days ago should fail
      const twoDaysAgo = new Date()
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
      expect(isDateInRange(twoDaysAgo, startDate)).toBe(false)
    })

    it('should handle 365 day filter', () => {
      const startDate = calculateStartDate(365)
      expect(startDate).not.toBeNull()

      // 6 months ago should pass
      const sixMonthsAgo = new Date()
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
      expect(isDateInRange(sixMonthsAgo, startDate)).toBe(true)

      // 2 years ago should fail
      const twoYearsAgo = new Date()
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
      expect(isDateInRange(twoYearsAgo, startDate)).toBe(false)
    })
  })
})
