import { describe, it, expect } from 'vitest'

// Test component trend calculation logic
// These are pure function tests - no database required

/**
 * Helper function that mirrors the trend calculation algorithm
 * from /api/components/[id]/route.ts for testing
 */
function calculateTrendFromTransactions(
  transactions: Array<{ date: string; quantityChange: number }>,
  days: number
): Array<{ date: string; quantityOnHand: number }> {
  if (transactions.length === 0) {
    return []
  }

  // Sort transactions by date
  const sortedTransactions = [...transactions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  // Calculate running total grouped by date
  const dailyTotals = new Map<string, number>()
  let runningTotal = 0

  for (const tx of sortedTransactions) {
    runningTotal += tx.quantityChange
    dailyTotals.set(tx.date, runningTotal)
  }

  // Generate date range for the requested period
  const today = new Date()
  const startDate = new Date(today)
  startDate.setDate(startDate.getDate() - days)
  startDate.setHours(0, 0, 0, 0)

  const trend: Array<{ date: string; quantityOnHand: number }> = []
  let lastKnownQuantity = 0

  // Find the quantity at startDate
  const sortedDates = Array.from(dailyTotals.keys()).sort()
  for (const dateStr of sortedDates) {
    if (new Date(dateStr) < startDate) {
      lastKnownQuantity = dailyTotals.get(dateStr) ?? 0
    }
  }

  // Generate trend points
  const step = Math.max(1, Math.floor(days / 30))
  const currentDate = new Date(startDate)

  while (currentDate <= today) {
    const dateStr = currentDate.toISOString().split('T')[0]

    if (dailyTotals.has(dateStr)) {
      lastKnownQuantity = dailyTotals.get(dateStr)!
    }

    trend.push({
      date: dateStr,
      quantityOnHand: lastKnownQuantity,
    })

    currentDate.setDate(currentDate.getDate() + step)
  }

  return trend
}

describe('Component Trend Calculation', () => {
  describe('Cumulative Quantity', () => {
    it('should calculate running total correctly', () => {
      const today = new Date()
      const d1 = new Date(today)
      d1.setDate(d1.getDate() - 5)
      const d2 = new Date(today)
      d2.setDate(d2.getDate() - 3)
      const d3 = new Date(today)
      d3.setDate(d3.getDate() - 1)

      const transactions = [
        { date: d1.toISOString().split('T')[0], quantityChange: 100 },
        { date: d2.toISOString().split('T')[0], quantityChange: -30 },
        { date: d3.toISOString().split('T')[0], quantityChange: 50 },
      ]

      const trend = calculateTrendFromTransactions(transactions, 7)

      // Find the entries for our transaction dates
      const lastEntry = trend[trend.length - 1]
      // Final quantity should be 100 - 30 + 50 = 120
      expect(lastEntry.quantityOnHand).toBe(120)
    })

    it('should handle empty history', () => {
      const trend = calculateTrendFromTransactions([], 30)
      expect(trend).toHaveLength(0)
    })

    it('should aggregate same-day transactions', () => {
      const today = new Date()
      const sameDay = new Date(today)
      sameDay.setDate(sameDay.getDate() - 2)
      const sameDayStr = sameDay.toISOString().split('T')[0]

      // Two transactions on the same date - but they're separate entries
      // The calculation sums them up
      const transactions = [
        { date: sameDayStr, quantityChange: 100 },
        { date: sameDayStr, quantityChange: 50 },
      ]

      const trend = calculateTrendFromTransactions(transactions, 7)

      // Last entry should show combined quantity
      const lastEntry = trend[trend.length - 1]
      expect(lastEntry.quantityOnHand).toBe(150)
    })

    it('should handle negative quantity changes', () => {
      const today = new Date()
      const d1 = new Date(today)
      d1.setDate(d1.getDate() - 3)
      const d2 = new Date(today)
      d2.setDate(d2.getDate() - 1)

      const transactions = [
        { date: d1.toISOString().split('T')[0], quantityChange: 100 },
        { date: d2.toISOString().split('T')[0], quantityChange: -150 },
      ]

      const trend = calculateTrendFromTransactions(transactions, 7)

      // Final quantity should be 100 - 150 = -50
      const lastEntry = trend[trend.length - 1]
      expect(lastEntry.quantityOnHand).toBe(-50)
    })

    it('should handle single transaction', () => {
      const today = new Date()
      const singleDay = new Date(today)
      singleDay.setDate(singleDay.getDate() - 2)

      const transactions = [
        { date: singleDay.toISOString().split('T')[0], quantityChange: 500 },
      ]

      const trend = calculateTrendFromTransactions(transactions, 7)

      expect(trend.length).toBeGreaterThan(0)
      const lastEntry = trend[trend.length - 1]
      expect(lastEntry.quantityOnHand).toBe(500)
    })
  })

  describe('Date Range', () => {
    it('should filter by start date', () => {
      const today = new Date()
      // Transaction 30 days ago
      const oldDate = new Date(today)
      oldDate.setDate(oldDate.getDate() - 30)
      // Transaction 2 days ago
      const recentDate = new Date(today)
      recentDate.setDate(recentDate.getDate() - 2)

      const transactions = [
        { date: oldDate.toISOString().split('T')[0], quantityChange: 100 },
        { date: recentDate.toISOString().split('T')[0], quantityChange: 50 },
      ]

      // Only look at last 7 days
      const trend = calculateTrendFromTransactions(transactions, 7)

      // The trend should start with quantity from before the range (100)
      // then update to 150 when the recent transaction is hit
      const firstEntry = trend[0]
      expect(firstEntry.quantityOnHand).toBe(100) // baseline from before range

      const lastEntry = trend[trend.length - 1]
      expect(lastEntry.quantityOnHand).toBe(150) // includes recent transaction
    })

    it('should include all dates in range', () => {
      const today = new Date()
      const d1 = new Date(today)
      d1.setDate(d1.getDate() - 5)

      const transactions = [
        { date: d1.toISOString().split('T')[0], quantityChange: 100 },
      ]

      const trend = calculateTrendFromTransactions(transactions, 7)

      // Should have multiple data points covering the 7-day range
      expect(trend.length).toBeGreaterThanOrEqual(7)
    })

    it('should limit to ~30 points for large ranges', () => {
      const today = new Date()
      const d1 = new Date(today)
      d1.setDate(d1.getDate() - 45)

      const transactions = [
        { date: d1.toISOString().split('T')[0], quantityChange: 100 },
      ]

      // 90 days should be sampled to ~30 points
      const trend = calculateTrendFromTransactions(transactions, 90)

      // With step = 3 (90/30), we should have approximately 30 points
      expect(trend.length).toBeLessThanOrEqual(35)
      expect(trend.length).toBeGreaterThanOrEqual(25)
    })
  })

  describe('Edge Cases', () => {
    it('should handle transactions before date range', () => {
      const today = new Date()
      // Transaction 60 days ago
      const oldDate = new Date(today)
      oldDate.setDate(oldDate.getDate() - 60)

      const transactions = [
        { date: oldDate.toISOString().split('T')[0], quantityChange: 100 },
      ]

      // Only look at last 7 days
      const trend = calculateTrendFromTransactions(transactions, 7)

      // All entries should show the quantity established before the range
      trend.forEach((point) => {
        expect(point.quantityOnHand).toBe(100)
      })
    })

    it('should handle zero quantity changes', () => {
      const today = new Date()
      const d1 = new Date(today)
      d1.setDate(d1.getDate() - 3)

      const transactions = [
        { date: d1.toISOString().split('T')[0], quantityChange: 0 },
      ]

      const trend = calculateTrendFromTransactions(transactions, 7)

      const lastEntry = trend[trend.length - 1]
      expect(lastEntry.quantityOnHand).toBe(0)
    })

    it('should handle large quantity values', () => {
      const today = new Date()
      const d1 = new Date(today)
      d1.setDate(d1.getDate() - 2)

      const transactions = [
        { date: d1.toISOString().split('T')[0], quantityChange: 1000000 },
      ]

      const trend = calculateTrendFromTransactions(transactions, 7)

      const lastEntry = trend[trend.length - 1]
      expect(lastEntry.quantityOnHand).toBe(1000000)
    })
  })
})
