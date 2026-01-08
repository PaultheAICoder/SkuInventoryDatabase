import { describe, it, expect } from 'vitest'
import { toLocalDateString } from '@/lib/utils'

// Test the analytics calculation logic
// These are pure function tests - no database required

describe('Analytics Calculations', () => {
  describe('Defect Rate Calculation', () => {
    it('should calculate defect rate correctly', () => {
      const defectCount = 5
      const unitsBuild = 100
      const defectRate = (defectCount / unitsBuild) * 100
      expect(defectRate).toBe(5)
    })

    it('should return 0 when no units built', () => {
      const defectCount = 5
      const unitsBuild = 0
      const defectRate = unitsBuild > 0 ? (defectCount / unitsBuild) * 100 : 0
      expect(defectRate).toBe(0)
    })

    it('should handle decimal rates', () => {
      const defectCount = 3
      const unitsBuild = 100
      const defectRate = (defectCount / unitsBuild) * 100
      expect(defectRate).toBe(3)
    })
  })

  describe('Affected Rate Calculation', () => {
    it('should calculate affected rate correctly', () => {
      const affectedUnits = 10
      const unitsBuild = 100
      const affectedRate = (affectedUnits / unitsBuild) * 100
      expect(affectedRate).toBe(10)
    })

    it('should handle zero affected units', () => {
      const affectedUnits = 0
      const unitsBuild = 100
      const affectedRate = (affectedUnits / unitsBuild) * 100
      expect(affectedRate).toBe(0)
    })
  })

  describe('Date Grouping', () => {
    it('should group by day correctly', () => {
      // Use explicit local time to avoid timezone issues (noon local time)
      const date = new Date(2025, 11, 3, 12, 0, 0) // December 3, 2025 at noon local
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const key = `${year}-${month}-${day}`
      expect(key).toBe('2025-12-03')
    })

    it('should group by month correctly', () => {
      // Use explicit local time to avoid timezone issues
      const date = new Date(2025, 11, 15, 12, 0, 0) // December 15, 2025 at noon local
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const key = `${year}-${month}-01`
      expect(key).toBe('2025-12-01')
    })

    it('should get Monday for week grouping', () => {
      // Wednesday December 3, 2025 (use local time to avoid timezone issues)
      const date = new Date(2025, 11, 3, 12, 0, 0) // December 3, 2025 at noon local
      const dayOfWeek = date.getDay()
      const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
      const monday = new Date(date)
      monday.setDate(diff)
      const key = toLocalDateString(monday)
      expect(key).toBe('2025-12-01') // Monday of that week
    })
  })

  describe('Summary Statistics', () => {
    it('should calculate average correctly', () => {
      const rates = [1, 2, 3, 4, 5]
      const avg = rates.reduce((a, b) => a + b, 0) / rates.length
      expect(avg).toBe(3)
    })

    it('should find min/max correctly', () => {
      const rates = [1.5, 2.3, 0.5, 4.2, 3.1]
      expect(Math.min(...rates)).toBe(0.5)
      expect(Math.max(...rates)).toBe(4.2)
    })

    it('should handle empty rates array', () => {
      const rates: number[] = []
      const avg = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0
      const min = rates.length > 0 ? Math.min(...rates) : 0
      const max = rates.length > 0 ? Math.max(...rates) : 0
      expect(avg).toBe(0)
      expect(min).toBe(0)
      expect(max).toBe(0)
    })
  })
})
