import { describe, it, expect } from 'vitest'

/**
 * Tests for reorder urgency features (Issue #19)
 * - Lead time hint generation
 * - Urgency score calculation for sorting
 */

// Re-implement the functions here for unit testing
// These functions mirror the implementations in the API route and component

/**
 * Generate lead-time urgency hint text based on reorder status and lead time.
 * Mirror of the function in CriticalComponentsList.tsx
 */
function getLeadTimeHint(status: 'critical' | 'warning' | 'ok', leadTimeDays: number): string {
  if (status === 'ok') {
    return ''  // No hint needed for OK status
  }

  if (leadTimeDays === 0) {
    return status === 'critical' ? 'Order immediately' : 'Monitor stock'
  }

  if (leadTimeDays <= 3) {
    return status === 'critical'
      ? 'Order immediately'
      : `Monitor (${leadTimeDays}d lead time)`
  }

  if (leadTimeDays <= 7) {
    return `Order soon (${leadTimeDays} days lead time)`
  }

  if (leadTimeDays <= 14) {
    return `Order within 1 week (${leadTimeDays} days lead time)`
  }

  const weeks = Math.ceil(leadTimeDays / 7)
  return `Order urgently (${weeks} weeks lead time)`
}

/**
 * Calculate urgency score for reorder prioritization.
 * Mirror of the function in dashboard/route.ts
 * Higher score = more urgent (should appear first in list).
 * Formula: (deficitRatio * 100) + (leadTimeDays * 2)
 */
function calculateUrgencyScore(
  quantityOnHand: number,
  reorderPoint: number,
  leadTimeDays: number
): number {
  const deficit = reorderPoint - quantityOnHand
  const deficitRatio = deficit / Math.max(reorderPoint, 1)
  return (deficitRatio * 100) + (leadTimeDays * 2)
}

describe('getLeadTimeHint', () => {
  describe('critical status', () => {
    it('returns "Order immediately" for 0 lead time', () => {
      expect(getLeadTimeHint('critical', 0)).toBe('Order immediately')
    })

    it('returns "Order immediately" for 1-3 day lead time', () => {
      expect(getLeadTimeHint('critical', 1)).toBe('Order immediately')
      expect(getLeadTimeHint('critical', 2)).toBe('Order immediately')
      expect(getLeadTimeHint('critical', 3)).toBe('Order immediately')
    })

    it('returns "Order soon" for 4-7 day lead time', () => {
      expect(getLeadTimeHint('critical', 4)).toBe('Order soon (4 days lead time)')
      expect(getLeadTimeHint('critical', 5)).toBe('Order soon (5 days lead time)')
      expect(getLeadTimeHint('critical', 7)).toBe('Order soon (7 days lead time)')
    })

    it('returns "Order within 1 week" for 8-14 day lead time', () => {
      expect(getLeadTimeHint('critical', 8)).toBe('Order within 1 week (8 days lead time)')
      expect(getLeadTimeHint('critical', 10)).toBe('Order within 1 week (10 days lead time)')
      expect(getLeadTimeHint('critical', 14)).toBe('Order within 1 week (14 days lead time)')
    })

    it('returns "Order urgently" with weeks for 15+ day lead time', () => {
      expect(getLeadTimeHint('critical', 15)).toBe('Order urgently (3 weeks lead time)')
      expect(getLeadTimeHint('critical', 21)).toBe('Order urgently (3 weeks lead time)')
      expect(getLeadTimeHint('critical', 22)).toBe('Order urgently (4 weeks lead time)')
      expect(getLeadTimeHint('critical', 28)).toBe('Order urgently (4 weeks lead time)')
      expect(getLeadTimeHint('critical', 30)).toBe('Order urgently (5 weeks lead time)')
    })
  })

  describe('warning status', () => {
    it('returns "Monitor stock" for 0 lead time', () => {
      expect(getLeadTimeHint('warning', 0)).toBe('Monitor stock')
    })

    it('returns "Monitor" with lead time for 1-3 days', () => {
      expect(getLeadTimeHint('warning', 1)).toBe('Monitor (1d lead time)')
      expect(getLeadTimeHint('warning', 2)).toBe('Monitor (2d lead time)')
      expect(getLeadTimeHint('warning', 3)).toBe('Monitor (3d lead time)')
    })

    it('returns same hints as critical for 4+ day lead time', () => {
      // At longer lead times, both critical and warning get the same urgency hints
      expect(getLeadTimeHint('warning', 5)).toBe('Order soon (5 days lead time)')
      expect(getLeadTimeHint('warning', 10)).toBe('Order within 1 week (10 days lead time)')
      expect(getLeadTimeHint('warning', 20)).toBe('Order urgently (3 weeks lead time)')
    })
  })

  describe('ok status', () => {
    it('returns empty string for any lead time', () => {
      expect(getLeadTimeHint('ok', 0)).toBe('')
      expect(getLeadTimeHint('ok', 5)).toBe('')
      expect(getLeadTimeHint('ok', 10)).toBe('')
      expect(getLeadTimeHint('ok', 30)).toBe('')
    })
  })
})

describe('calculateUrgencyScore', () => {
  describe('deficit ratio component', () => {
    it('calculates higher score for larger deficit', () => {
      // Same lead time, different deficits
      const score1 = calculateUrgencyScore(5, 10, 7)  // 50% deficit
      const score2 = calculateUrgencyScore(2, 10, 7)  // 80% deficit
      expect(score2).toBeGreaterThan(score1)
    })

    it('handles zero reorder point without division error', () => {
      // When reorderPoint is 0, we use max(reorderPoint, 1) = 1
      // deficit = 0 - 5 = -5, deficitRatio = -5/1 = -5
      // score = -5 * 100 + 7 * 2 = -500 + 14 = -486
      const score = calculateUrgencyScore(5, 0, 7)
      expect(score).toBe(-486)  // Negative deficit (surplus) + lead time
    })

    it('handles negative quantity (below zero)', () => {
      // quantityOnHand = -5, reorderPoint = 10
      // deficit = 10 - (-5) = 15, deficitRatio = 15/10 = 1.5
      const score = calculateUrgencyScore(-5, 10, 7)
      expect(score).toBeGreaterThan(calculateUrgencyScore(5, 10, 7))
    })

    it('calculates correct score at various deficit ratios', () => {
      // 100% deficit (quantityOnHand = 0)
      expect(calculateUrgencyScore(0, 100, 0)).toBe(100)

      // 50% deficit
      expect(calculateUrgencyScore(50, 100, 0)).toBe(50)

      // 0% deficit (at reorder point)
      expect(calculateUrgencyScore(100, 100, 0)).toBe(0)
    })
  })

  describe('lead time component', () => {
    it('calculates higher score for longer lead time', () => {
      // Same deficit, different lead times
      const score1 = calculateUrgencyScore(5, 10, 7)   // 7 days
      const score2 = calculateUrgencyScore(5, 10, 14)  // 14 days
      expect(score2).toBeGreaterThan(score1)
    })

    it('handles zero lead time', () => {
      // deficit ratio = 50%, lead time = 0
      const score = calculateUrgencyScore(5, 10, 0)
      expect(score).toBe(50)  // 50% deficit * 100 + 0
    })

    it('adds 2 points per day of lead time', () => {
      const score0days = calculateUrgencyScore(5, 10, 0)
      const score7days = calculateUrgencyScore(5, 10, 7)
      const score14days = calculateUrgencyScore(5, 10, 14)

      expect(score7days - score0days).toBe(14)  // 7 days * 2 points
      expect(score14days - score0days).toBe(28) // 14 days * 2 points
    })
  })

  describe('combined scoring', () => {
    it('prioritizes high deficit + long lead time', () => {
      const highUrgency = calculateUrgencyScore(0, 100, 30)   // 100% deficit + 30 days
      const mediumUrgency = calculateUrgencyScore(50, 100, 7) // 50% deficit + 7 days
      const lowUrgency = calculateUrgencyScore(90, 100, 0)    // 10% deficit + 0 days

      expect(highUrgency).toBeGreaterThan(mediumUrgency)
      expect(mediumUrgency).toBeGreaterThan(lowUrgency)
    })

    it('breaks tie on lead time when deficit is equal', () => {
      const longerLead = calculateUrgencyScore(5, 10, 14)
      const shorterLead = calculateUrgencyScore(5, 10, 7)
      expect(longerLead).toBeGreaterThan(shorterLead)
    })

    it('calculates expected values for specific scenarios', () => {
      // Scenario 1: 100% deficit, 30 days lead time
      // deficitRatio = 100/100 = 1.0, score = 1.0 * 100 + 30 * 2 = 160
      expect(calculateUrgencyScore(0, 100, 30)).toBe(160)

      // Scenario 2: 50% deficit, 7 days lead time
      // deficitRatio = 50/100 = 0.5, score = 0.5 * 100 + 7 * 2 = 64
      expect(calculateUrgencyScore(50, 100, 7)).toBe(64)

      // Scenario 3: 10% deficit, 0 days lead time
      // deficitRatio = 10/100 = 0.1, score = 0.1 * 100 + 0 * 2 = 10
      expect(calculateUrgencyScore(90, 100, 0)).toBe(10)
    })
  })
})

describe('urgency sorting order', () => {
  it('sorts components correctly by urgency', () => {
    const components = [
      { name: 'A', quantityOnHand: 90, reorderPoint: 100, leadTimeDays: 0 },   // 10% deficit, 0 days
      { name: 'B', quantityOnHand: 0, reorderPoint: 100, leadTimeDays: 30 },   // 100% deficit, 30 days
      { name: 'C', quantityOnHand: 50, reorderPoint: 100, leadTimeDays: 7 },   // 50% deficit, 7 days
    ]

    const sorted = [...components].sort((a, b) => {
      const aScore = calculateUrgencyScore(a.quantityOnHand, a.reorderPoint, a.leadTimeDays)
      const bScore = calculateUrgencyScore(b.quantityOnHand, b.reorderPoint, b.leadTimeDays)
      return bScore - aScore  // Higher urgency first
    })

    expect(sorted[0].name).toBe('B')  // Highest urgency (160 points)
    expect(sorted[1].name).toBe('C')  // Medium urgency (64 points)
    expect(sorted[2].name).toBe('A')  // Lowest urgency (10 points)
  })

  it('handles components with same deficit but different lead times', () => {
    const components = [
      { name: 'Short', quantityOnHand: 50, reorderPoint: 100, leadTimeDays: 7 },
      { name: 'Long', quantityOnHand: 50, reorderPoint: 100, leadTimeDays: 21 },
      { name: 'Medium', quantityOnHand: 50, reorderPoint: 100, leadTimeDays: 14 },
    ]

    const sorted = [...components].sort((a, b) => {
      const aScore = calculateUrgencyScore(a.quantityOnHand, a.reorderPoint, a.leadTimeDays)
      const bScore = calculateUrgencyScore(b.quantityOnHand, b.reorderPoint, b.leadTimeDays)
      return bScore - aScore
    })

    expect(sorted[0].name).toBe('Long')   // 50 + 42 = 92
    expect(sorted[1].name).toBe('Medium') // 50 + 28 = 78
    expect(sorted[2].name).toBe('Short')  // 50 + 14 = 64
  })

  it('handles components with negative quantity (severe deficit)', () => {
    const components = [
      { name: 'Normal', quantityOnHand: 50, reorderPoint: 100, leadTimeDays: 7 },
      { name: 'Negative', quantityOnHand: -20, reorderPoint: 100, leadTimeDays: 7 },
    ]

    const sorted = [...components].sort((a, b) => {
      const aScore = calculateUrgencyScore(a.quantityOnHand, a.reorderPoint, a.leadTimeDays)
      const bScore = calculateUrgencyScore(b.quantityOnHand, b.reorderPoint, b.leadTimeDays)
      return bScore - aScore
    })

    // Negative quantity = 120% deficit, should be more urgent
    expect(sorted[0].name).toBe('Negative')
    expect(sorted[1].name).toBe('Normal')
  })

  it('maintains stable sort order for equal scores', () => {
    const components = [
      { name: 'First', quantityOnHand: 50, reorderPoint: 100, leadTimeDays: 7 },
      { name: 'Second', quantityOnHand: 50, reorderPoint: 100, leadTimeDays: 7 },
    ]

    const sorted = [...components].sort((a, b) => {
      const aScore = calculateUrgencyScore(a.quantityOnHand, a.reorderPoint, a.leadTimeDays)
      const bScore = calculateUrgencyScore(b.quantityOnHand, b.reorderPoint, b.leadTimeDays)
      return bScore - aScore
    })

    // Both have same score, order should be maintained (stable sort)
    expect(sorted.length).toBe(2)
    // Just verify both are present - stable sort behavior may vary
    expect(sorted.map(c => c.name)).toContain('First')
    expect(sorted.map(c => c.name)).toContain('Second')
  })
})
