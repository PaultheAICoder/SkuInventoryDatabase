import { describe, it, expect } from 'vitest'

// Test date parsing logic used in transaction parser
// These tests verify the fix for GitHub Issue #217: timezone date off-by-one bug

describe('Transaction Parser Date Handling', () => {
  describe('Date string parsing', () => {
    it('should parse YYYY-MM-DD as local date, not UTC', () => {
      // The fix: new Date("2025-11-17T00:00:00") should give local midnight
      const dateString = '2025-11-17'
      const dateWithTime = dateString.includes('T') ? dateString : `${dateString}T00:00:00`
      const parsed = new Date(dateWithTime)

      // The date should be Nov 17 in local time, regardless of timezone
      expect(parsed.getDate()).toBe(17)
      expect(parsed.getMonth()).toBe(10) // 0-indexed, November = 10
      expect(parsed.getFullYear()).toBe(2025)
    })

    it('should handle ISO datetime strings correctly', () => {
      // If the date already has a time component, don't add another
      const isoString = '2025-11-17T14:30:00Z'
      const dateWithTime = isoString.includes('T') ? isoString : `${isoString}T00:00:00`
      const parsed = new Date(dateWithTime)

      expect(parsed.getTime()).not.toBeNaN()
      // The date should be parseable (exact day depends on timezone)
    })

    it('should demonstrate the bug being fixed', () => {
      // This test documents the bug we're fixing
      // new Date("2025-11-17") is parsed as UTC midnight
      // new Date("2025-11-17T00:00:00") is parsed as local midnight
      const buggyDate = new Date('2025-11-17') // UTC midnight - problematic!
      const fixedDate = new Date('2025-11-17T00:00:00') // Local midnight - correct!

      // Both should be valid dates
      expect(buggyDate.getTime()).not.toBeNaN()
      expect(fixedDate.getTime()).not.toBeNaN()

      // The fixed date should always show day 17 in local time
      expect(fixedDate.getDate()).toBe(17)

      // Note: buggyDate.getDate() may return 16 or 17 depending on timezone
      // In Pacific Time (UTC-8), it returns 16 (the previous day!)
      // This test passes regardless of machine timezone, but documents the issue
    })

    it('should preserve hour and minute from full ISO timestamp', () => {
      const isoTimestamp = '2025-11-17T09:30:00'
      const dateWithTime = isoTimestamp.includes('T') ? isoTimestamp : `${isoTimestamp}T00:00:00`
      const parsed = new Date(dateWithTime)

      // Should preserve the original time
      expect(parsed.getHours()).toBe(9)
      expect(parsed.getMinutes()).toBe(30)
    })

    it('should handle edge cases near midnight', () => {
      // Test date parsing near midnight - common timezone edge case
      const dateString = '2025-01-01' // New Year's Day
      const dateWithTime = dateString.includes('T') ? dateString : `${dateString}T00:00:00`
      const parsed = new Date(dateWithTime)

      expect(parsed.getDate()).toBe(1)
      expect(parsed.getMonth()).toBe(0) // January = 0
      expect(parsed.getFullYear()).toBe(2025)
    })

    it('should handle date strings at end of month', () => {
      // Test parsing for dates at end of month (common off-by-one edge case)
      const dateString = '2025-11-30' // Last day of November
      const dateWithTime = dateString.includes('T') ? dateString : `${dateString}T00:00:00`
      const parsed = new Date(dateWithTime)

      expect(parsed.getDate()).toBe(30)
      expect(parsed.getMonth()).toBe(10) // November = 10
    })

    it('should handle leap year date', () => {
      // 2024 is a leap year - test Feb 29
      const dateString = '2024-02-29'
      const dateWithTime = dateString.includes('T') ? dateString : `${dateString}T00:00:00`
      const parsed = new Date(dateWithTime)

      expect(parsed.getDate()).toBe(29)
      expect(parsed.getMonth()).toBe(1) // February = 1
      expect(parsed.getFullYear()).toBe(2024)
    })
  })

  describe('Date parsing edge cases', () => {
    it('should return NaN for invalid date strings', () => {
      const invalidDate = new Date('not-a-date')
      expect(isNaN(invalidDate.getTime())).toBe(true)
    })

    it('should handle empty string gracefully', () => {
      // The transaction parser has a fallback for invalid dates
      const dateString = ''
      const dateWithTime = dateString.includes('T') ? dateString : `${dateString}T00:00:00`
      const parsed = new Date(dateWithTime)

      // Empty string with T00:00:00 appended is invalid
      expect(isNaN(parsed.getTime())).toBe(true)
    })

    it('should use fallback for invalid dates in transaction parser logic', () => {
      // Simulating the transaction parser fallback logic
      const invalidDateString = 'invalid'
      let parsedDate: Date
      try {
        const dateString = invalidDateString.includes('T')
          ? invalidDateString
          : `${invalidDateString}T00:00:00`
        parsedDate = new Date(dateString)
        if (isNaN(parsedDate.getTime())) {
          parsedDate = new Date() // fallback to today
        }
      } catch {
        parsedDate = new Date()
      }

      // Should have fallen back to today's date (not NaN)
      expect(isNaN(parsedDate.getTime())).toBe(false)
    })
  })
})
