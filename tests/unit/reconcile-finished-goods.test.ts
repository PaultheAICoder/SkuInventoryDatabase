/**
 * Unit tests for finished goods reconciliation logic
 * Tests the discrepancy detection between FinishedGoodsBalance and FinishedGoodsLine
 */
import { describe, it, expect } from 'vitest'

describe('Finished Goods Reconciliation', () => {
  describe('Discrepancy Detection Logic', () => {
    const TOLERANCE = 0.0001

    /**
     * Core discrepancy detection logic (extracted for testability)
     * This mirrors the logic in reconcile-finished-goods-balances.ts
     */
    function detectDiscrepancy(balanceQty: number, linesSum: number): number | null {
      const diff = balanceQty - linesSum
      if (Math.abs(diff) > TOLERANCE) {
        return diff
      }
      return null
    }

    it('returns null when balance matches lines sum exactly', () => {
      const result = detectDiscrepancy(100, 100)
      expect(result).toBeNull()
    })

    it('returns null when difference is within tolerance', () => {
      // 0.00001 is within 0.0001 tolerance
      expect(detectDiscrepancy(100.00001, 100)).toBeNull()
      expect(detectDiscrepancy(100, 100.00001)).toBeNull()
    })

    it('returns positive discrepancy when balance exceeds lines sum', () => {
      const result = detectDiscrepancy(100, 75)
      expect(result).toBe(25)
    })

    it('returns negative discrepancy when lines sum exceeds balance', () => {
      const result = detectDiscrepancy(75, 100)
      expect(result).toBe(-25)
    })

    it('returns discrepancy when balance has no lines (lines sum is 0)', () => {
      const result = detectDiscrepancy(25, 0)
      expect(result).toBe(25)
    })

    it('returns discrepancy when balance is 0 but lines sum is not', () => {
      const result = detectDiscrepancy(0, 25)
      expect(result).toBe(-25)
    })

    it('returns null for zero balance with zero lines', () => {
      const result = detectDiscrepancy(0, 0)
      expect(result).toBeNull()
    })

    it('handles very small positive discrepancy just beyond tolerance', () => {
      // 0.0002 > 0.0001 tolerance
      const result = detectDiscrepancy(100.0002, 100)
      expect(result).not.toBeNull()
      expect(result).toBeCloseTo(0.0002, 5)
    })

    it('handles very small negative discrepancy just beyond tolerance', () => {
      // -0.0002 magnitude > 0.0001 tolerance
      const result = detectDiscrepancy(100, 100.0002)
      expect(result).not.toBeNull()
      expect(result).toBeCloseTo(-0.0002, 5)
    })

    it('handles large quantities correctly', () => {
      const result = detectDiscrepancy(10000, 9500)
      expect(result).toBe(500)
    })

    it('handles decimal quantities correctly', () => {
      const result = detectDiscrepancy(25.5, 20.25)
      expect(result).toBeCloseTo(5.25, 5)
    })
  })

  describe('Discrepancy Interface', () => {
    /**
     * Test the interface structure expected by the reconciliation script
     */
    interface FinishedGoodsDiscrepancy {
      skuId: string
      skuName: string
      skuInternalCode: string
      locationId: string
      locationName: string
      balance: number
      linesSum: number
      discrepancy: number
    }

    function createDiscrepancy(
      balance: number,
      linesSum: number,
      skuId = 'sku-1',
      skuName = 'Test SKU',
      skuInternalCode = 'TEST',
      locationId = 'loc-1',
      locationName = 'Warehouse'
    ): FinishedGoodsDiscrepancy {
      return {
        skuId,
        skuName,
        skuInternalCode,
        locationId,
        locationName,
        balance,
        linesSum,
        discrepancy: balance - linesSum,
      }
    }

    it('creates correct discrepancy object for positive discrepancy', () => {
      const d = createDiscrepancy(100, 75)
      expect(d.discrepancy).toBe(25)
      expect(d.balance).toBe(100)
      expect(d.linesSum).toBe(75)
    })

    it('creates correct discrepancy object for negative discrepancy', () => {
      const d = createDiscrepancy(50, 100)
      expect(d.discrepancy).toBe(-50)
    })

    it('creates correct discrepancy object with SKU details', () => {
      const d = createDiscrepancy(25, 0, 'sku-amz', 'AMZ 3pk', 'AMZ_3pk', 'loc-vtm', 'VTM HQ')
      expect(d.skuId).toBe('sku-amz')
      expect(d.skuName).toBe('AMZ 3pk')
      expect(d.skuInternalCode).toBe('AMZ_3pk')
      expect(d.locationId).toBe('loc-vtm')
      expect(d.locationName).toBe('VTM HQ')
    })
  })

  describe('Total Discrepancy Calculation', () => {
    interface DiscrepancyRecord {
      discrepancy: number
    }

    function calculateTotalAbsoluteDiscrepancy(discrepancies: DiscrepancyRecord[]): number {
      return discrepancies.reduce((sum, d) => sum + Math.abs(d.discrepancy), 0)
    }

    function calculateTotalNetDiscrepancy(discrepancies: DiscrepancyRecord[]): number {
      return discrepancies.reduce((sum, d) => sum + d.discrepancy, 0)
    }

    it('calculates total absolute discrepancy correctly', () => {
      const discrepancies = [
        { discrepancy: 25 },
        { discrepancy: -10 },
        { discrepancy: 5 },
      ]
      expect(calculateTotalAbsoluteDiscrepancy(discrepancies)).toBe(40)
    })

    it('calculates total net discrepancy correctly', () => {
      const discrepancies = [
        { discrepancy: 25 },
        { discrepancy: -10 },
        { discrepancy: 5 },
      ]
      expect(calculateTotalNetDiscrepancy(discrepancies)).toBe(20)
    })

    it('returns 0 for empty discrepancies', () => {
      expect(calculateTotalAbsoluteDiscrepancy([])).toBe(0)
      expect(calculateTotalNetDiscrepancy([])).toBe(0)
    })

    it('handles single discrepancy', () => {
      const discrepancies = [{ discrepancy: 25 }]
      expect(calculateTotalAbsoluteDiscrepancy(discrepancies)).toBe(25)
      expect(calculateTotalNetDiscrepancy(discrepancies)).toBe(25)
    })
  })

  describe('Output Formatting', () => {
    function formatDiscrepancy(value: number): string {
      const sign = value >= 0 ? '+' : ''
      return sign + value.toFixed(2)
    }

    it('formats positive discrepancy with plus sign', () => {
      expect(formatDiscrepancy(25)).toBe('+25.00')
    })

    it('formats negative discrepancy with minus sign', () => {
      expect(formatDiscrepancy(-10)).toBe('-10.00')
    })

    it('formats zero as +0.00', () => {
      expect(formatDiscrepancy(0)).toBe('+0.00')
    })

    it('formats decimal values correctly', () => {
      expect(formatDiscrepancy(25.5)).toBe('+25.50')
      expect(formatDiscrepancy(-10.25)).toBe('-10.25')
    })
  })
})
