import { describe, it, expect } from 'vitest'
import {
  calculateOrganic,
  calculateOrganicPercentage,
  calculateAdPercentage,
  hasAttributionAnomaly,
} from '@/services/attribution/amazon-attribution'

describe('Attribution Service', () => {
  describe('calculateOrganic', () => {
    it('should return organic = total - ad when ad < total', () => {
      expect(calculateOrganic(100, 40)).toBe(60)
    })

    it('should return 0 when ad equals total', () => {
      expect(calculateOrganic(100, 100)).toBe(0)
    })

    it('should return 0 when ad > total (anomaly case)', () => {
      expect(calculateOrganic(100, 150)).toBe(0)
    })

    it('should return total when ad is 0', () => {
      expect(calculateOrganic(100, 0)).toBe(100)
    })

    it('should handle zero total sales', () => {
      expect(calculateOrganic(0, 0)).toBe(0)
    })

    it('should handle decimal values', () => {
      expect(calculateOrganic(99.99, 33.33)).toBeCloseTo(66.66)
    })

    it('should handle large values', () => {
      expect(calculateOrganic(1000000, 400000)).toBe(600000)
    })
  })

  describe('calculateOrganicPercentage', () => {
    it('should calculate correct percentage', () => {
      expect(calculateOrganicPercentage(100, 60)).toBe(60)
    })

    it('should return 0 for zero total sales', () => {
      expect(calculateOrganicPercentage(0, 0)).toBe(0)
    })

    it('should round to 2 decimal places', () => {
      expect(calculateOrganicPercentage(100, 33.333)).toBe(33.33)
    })

    it('should handle 100% organic', () => {
      expect(calculateOrganicPercentage(100, 100)).toBe(100)
    })

    it('should handle 0% organic', () => {
      expect(calculateOrganicPercentage(100, 0)).toBe(0)
    })

    it('should round correctly for small fractions', () => {
      expect(calculateOrganicPercentage(1000, 1)).toBe(0.1)
    })

    it('should handle large sales values', () => {
      expect(calculateOrganicPercentage(1000000, 500000)).toBe(50)
    })
  })

  describe('calculateAdPercentage', () => {
    it('should calculate correct percentage', () => {
      expect(calculateAdPercentage(100, 40)).toBe(40)
    })

    it('should return 0 for zero total sales', () => {
      expect(calculateAdPercentage(0, 0)).toBe(0)
    })

    it('should handle 100% ad sales', () => {
      expect(calculateAdPercentage(100, 100)).toBe(100)
    })

    it('should handle 0% ad sales', () => {
      expect(calculateAdPercentage(100, 0)).toBe(0)
    })

    it('should handle anomaly case (ad > total) by returning > 100%', () => {
      expect(calculateAdPercentage(100, 150)).toBe(150)
    })

    it('should round to 2 decimal places', () => {
      expect(calculateAdPercentage(100, 33.333)).toBe(33.33)
    })
  })

  describe('hasAttributionAnomaly', () => {
    it('should detect when ad > total', () => {
      expect(hasAttributionAnomaly(100, 150)).toBe(true)
    })

    it('should not flag when ad < total', () => {
      expect(hasAttributionAnomaly(100, 40)).toBe(false)
    })

    it('should not flag when ad equals total', () => {
      expect(hasAttributionAnomaly(100, 100)).toBe(false)
    })

    it('should not flag when total is 0', () => {
      expect(hasAttributionAnomaly(0, 50)).toBe(false)
    })

    it('should detect small anomaly', () => {
      expect(hasAttributionAnomaly(100, 100.01)).toBe(true)
    })

    it('should not flag negative values as anomaly when total is 0', () => {
      expect(hasAttributionAnomaly(0, -10)).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    it('should handle very small values', () => {
      expect(calculateOrganic(0.01, 0.005)).toBeCloseTo(0.005)
      expect(calculateOrganicPercentage(0.01, 0.005)).toBe(50)
    })

    it('should handle negative ad values (impossible but defensive)', () => {
      expect(calculateOrganic(100, -10)).toBe(110)
    })

    it('should calculate complementary percentages', () => {
      const total = 100
      const ad = 40
      const organic = calculateOrganic(total, ad)
      const organicPct = calculateOrganicPercentage(total, organic)
      const adPct = calculateAdPercentage(total, ad)
      expect(organicPct + adPct).toBe(100)
    })
  })
})
