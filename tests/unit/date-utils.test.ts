import { describe, it, expect } from 'vitest'
import { parseLocalDate, formatDateString } from '@/lib/utils'

describe('parseLocalDate', () => {
  it('should parse date-only string as local midnight, not UTC', () => {
    const result = parseLocalDate('2025-12-08')

    // Should always be Dec 8 in local time
    expect(result.getDate()).toBe(8)
    expect(result.getMonth()).toBe(11) // December = 11
    expect(result.getFullYear()).toBe(2025)
  })

  it('should pass through Date objects unchanged', () => {
    const input = new Date('2025-12-08T15:30:00')
    const result = parseLocalDate(input)

    expect(result).toBe(input)
    expect(result.getTime()).toBe(input.getTime())
  })

  it('should preserve time component if present', () => {
    const result = parseLocalDate('2025-12-08T14:30:00')

    expect(result.getHours()).toBe(14)
    expect(result.getMinutes()).toBe(30)
  })

  it('should handle ISO timestamps with Z suffix', () => {
    const result = parseLocalDate('2025-12-08T14:30:00Z')

    // With Z suffix, it's UTC time (behavior unchanged)
    expect(result.getTime()).not.toBeNaN()
  })

  it('should handle edge case: last day of month', () => {
    const result = parseLocalDate('2025-11-30')

    expect(result.getDate()).toBe(30)
    expect(result.getMonth()).toBe(10) // November = 10
  })

  it('should handle edge case: leap year Feb 29', () => {
    const result = parseLocalDate('2024-02-29')

    expect(result.getDate()).toBe(29)
    expect(result.getMonth()).toBe(1) // February = 1
    expect(result.getFullYear()).toBe(2024)
  })

  it('should demonstrate the bug being fixed', () => {
    // This test documents the bug we're fixing
    // new Date("2025-12-08") is parsed as UTC midnight - problematic!
    // new Date("2025-12-08T00:00:00") is parsed as local midnight - correct!
    const buggyDate = new Date('2025-12-08') // UTC midnight
    const fixedDate = parseLocalDate('2025-12-08') // Uses our fix

    // Both should be valid dates
    expect(buggyDate.getTime()).not.toBeNaN()
    expect(fixedDate.getTime()).not.toBeNaN()

    // The fixed date should always show day 8 in local time
    expect(fixedDate.getDate()).toBe(8)

    // Note: buggyDate.getDate() may return 7 or 8 depending on timezone
    // In Pacific Time (UTC-8), it returns 7 (the previous day!)
    // This test passes regardless of machine timezone
  })

  it('should handle date at end of year', () => {
    const result = parseLocalDate('2025-12-31')

    expect(result.getDate()).toBe(31)
    expect(result.getMonth()).toBe(11) // December = 11
    expect(result.getFullYear()).toBe(2025)
  })

  it('should handle date at start of year', () => {
    const result = parseLocalDate('2025-01-01')

    expect(result.getDate()).toBe(1)
    expect(result.getMonth()).toBe(0) // January = 0
    expect(result.getFullYear()).toBe(2025)
  })
})

describe('formatDateString', () => {
  it('should format date-only string without timezone shift', () => {
    // This is the key test - regardless of machine timezone,
    // "2025-12-08" should format to show December 8
    const result = formatDateString('2025-12-08')
    expect(result).toContain('12')  // Month
    expect(result).toContain('8')   // Day (not 7!)
    expect(result).toContain('2025') // Year
  })

  it('should handle ISO timestamp correctly', () => {
    const result = formatDateString('2025-12-08T14:30:00.000Z')
    expect(result).toBeDefined()
  })

  it('should accept formatting options', () => {
    const result = formatDateString('2025-12-08', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
    expect(result).toContain('Dec')
    expect(result).toContain('8')
    expect(result).toContain('2025')
  })

  it('should format date with different options', () => {
    const result = formatDateString('2025-12-08', {
      month: 'long',
      day: 'numeric'
    })
    expect(result).toContain('December')
    expect(result).toContain('8')
  })

  it('should handle month/day only format options', () => {
    const result = formatDateString('2025-12-08', {
      month: 'short',
      day: 'numeric'
    })
    expect(result).toContain('Dec')
    expect(result).toContain('8')
  })

  it('should handle date at end of year', () => {
    const result = formatDateString('2025-12-31')
    expect(result).toContain('12')
    expect(result).toContain('31')
    expect(result).toContain('2025')
  })

  it('should handle date at start of year', () => {
    const result = formatDateString('2025-01-01')
    expect(result).toContain('1')
    expect(result).toContain('2025')
  })

  it('should demonstrate the display bug being fixed', () => {
    // This test documents the bug we're fixing
    // new Date("2025-12-08").toLocaleDateString() can show "12/7/2025" in Pacific Time
    // formatDateString("2025-12-08") should always show "12/8/2025"
    const result = formatDateString('2025-12-08')

    // The formatted string should always show day 8 in local time
    expect(result).toContain('8')
  })
})
