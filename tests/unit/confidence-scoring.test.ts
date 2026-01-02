import { describe, it, expect } from 'vitest'
import {
  calculateConfidence,
  calculateDataQualityScore,
  getConfidenceDescription,
  hasMinimumDataQuality,
  CONFIDENCE_THRESHOLDS,
  type DataQualityMetrics,
} from '@/services/recommendations/confidence-scoring'

describe('Confidence Scoring', () => {
  describe('calculateConfidence', () => {
    it('should return HIGH for 30+ days and 1000+ impressions', () => {
      const metrics: DataQualityMetrics = {
        dataPoints: 30,
        impressions: 1000,
        daysSpan: 30,
      }
      expect(calculateConfidence(metrics)).toBe('HIGH')
    })

    it('should return HIGH for well above thresholds', () => {
      const metrics: DataQualityMetrics = {
        dataPoints: 60,
        impressions: 5000,
        daysSpan: 60,
      }
      expect(calculateConfidence(metrics)).toBe('HIGH')
    })

    it('should return MEDIUM for 14-29 days and 500+ impressions', () => {
      const metrics: DataQualityMetrics = {
        dataPoints: 14,
        impressions: 500,
        daysSpan: 14,
      }
      expect(calculateConfidence(metrics)).toBe('MEDIUM')
    })

    it('should return MEDIUM for 20 days and 750 impressions', () => {
      const metrics: DataQualityMetrics = {
        dataPoints: 20,
        impressions: 750,
        daysSpan: 20,
      }
      expect(calculateConfidence(metrics)).toBe('MEDIUM')
    })

    it('should return LOW for <14 days', () => {
      const metrics: DataQualityMetrics = {
        dataPoints: 10,
        impressions: 2000, // Even with high impressions
        daysSpan: 10,
      }
      expect(calculateConfidence(metrics)).toBe('LOW')
    })

    it('should return LOW for <500 impressions', () => {
      const metrics: DataQualityMetrics = {
        dataPoints: 30, // Even with enough days
        impressions: 300,
        daysSpan: 30,
      }
      expect(calculateConfidence(metrics)).toBe('LOW')
    })

    it('should return LOW for minimal data', () => {
      const metrics: DataQualityMetrics = {
        dataPoints: 5,
        impressions: 100,
        daysSpan: 5,
      }
      expect(calculateConfidence(metrics)).toBe('LOW')
    })

    it('should return LOW for zero values', () => {
      const metrics: DataQualityMetrics = {
        dataPoints: 0,
        impressions: 0,
        daysSpan: 0,
      }
      expect(calculateConfidence(metrics)).toBe('LOW')
    })

    it('should require BOTH days AND impressions for each level', () => {
      // Has enough impressions but not days for HIGH - gets MEDIUM
      const metrics1: DataQualityMetrics = {
        dataPoints: 25,
        impressions: 5000,
        daysSpan: 25,
      }
      expect(calculateConfidence(metrics1)).toBe('MEDIUM')

      // Has enough days for HIGH but not impressions - gets MEDIUM (meets MEDIUM thresholds)
      const metrics2: DataQualityMetrics = {
        dataPoints: 35,
        impressions: 800,
        daysSpan: 35,
      }
      expect(calculateConfidence(metrics2)).toBe('MEDIUM') // 35 days >= 14, 800 impressions >= 500

      // Not enough for MEDIUM either - gets LOW
      const metrics3: DataQualityMetrics = {
        dataPoints: 35,
        impressions: 300, // < 500
        daysSpan: 35,
      }
      expect(calculateConfidence(metrics3)).toBe('LOW')
    })

    it('should handle edge cases at threshold boundaries', () => {
      // Just below HIGH
      const metrics1: DataQualityMetrics = {
        dataPoints: 29,
        impressions: 999,
        daysSpan: 29,
      }
      expect(calculateConfidence(metrics1)).toBe('MEDIUM')

      // Just at MEDIUM lower bound
      const metrics2: DataQualityMetrics = {
        dataPoints: 13,
        impressions: 499,
        daysSpan: 13,
      }
      expect(calculateConfidence(metrics2)).toBe('LOW')
    })
  })

  describe('calculateDataQualityScore', () => {
    it('should return 100 for ideal data', () => {
      const metrics: DataQualityMetrics = {
        dataPoints: 30,
        impressions: 1000,
        daysSpan: 30,
      }
      expect(calculateDataQualityScore(metrics)).toBe(100)
    })

    it('should return 0 for no data', () => {
      const metrics: DataQualityMetrics = {
        dataPoints: 0,
        impressions: 0,
        daysSpan: 0,
      }
      expect(calculateDataQualityScore(metrics)).toBe(0)
    })

    it('should scale proportionally for days', () => {
      // Half the days = ~25 points from days component
      const metrics: DataQualityMetrics = {
        dataPoints: 15,
        impressions: 0,
        daysSpan: 15,
      }
      const score = calculateDataQualityScore(metrics)
      expect(score).toBeCloseTo(25, 0)
    })

    it('should cap at 100 for excessive data', () => {
      const metrics: DataQualityMetrics = {
        dataPoints: 365,
        impressions: 1000000,
        daysSpan: 365,
      }
      expect(calculateDataQualityScore(metrics)).toBe(100)
    })

    it('should handle 1 impression (log10(1) = 0)', () => {
      const metrics: DataQualityMetrics = {
        dataPoints: 0,
        impressions: 1,
        daysSpan: 0,
      }
      expect(calculateDataQualityScore(metrics)).toBe(0)
    })

    it('should scale logarithmically for impressions', () => {
      // 10 impressions = log10(10) = 1, should be ~17 points (1/3 of 50)
      const metrics: DataQualityMetrics = {
        dataPoints: 0,
        impressions: 10,
        daysSpan: 0,
      }
      const score = calculateDataQualityScore(metrics)
      expect(score).toBeGreaterThan(10)
      expect(score).toBeLessThan(25)
    })

    it('should return intermediate values', () => {
      const metrics: DataQualityMetrics = {
        dataPoints: 20,
        impressions: 500,
        daysSpan: 20,
      }
      const score = calculateDataQualityScore(metrics)
      expect(score).toBeGreaterThan(50)
      expect(score).toBeLessThan(100)
    })
  })

  describe('getConfidenceDescription', () => {
    it('should return appropriate description for HIGH', () => {
      const desc = getConfidenceDescription('HIGH')
      expect(desc).toContain('30+')
      expect(desc.toLowerCase()).toContain('high')
    })

    it('should return appropriate description for MEDIUM', () => {
      const desc = getConfidenceDescription('MEDIUM')
      expect(desc).toContain('14-29')
      expect(desc.toLowerCase()).toContain('good')
    })

    it('should return appropriate description for LOW', () => {
      const desc = getConfidenceDescription('LOW')
      expect(desc.toLowerCase()).toContain('limited')
    })
  })

  describe('hasMinimumDataQuality', () => {
    it('should return true for sufficient data', () => {
      const metrics: DataQualityMetrics = {
        dataPoints: 10,
        impressions: 200,
        daysSpan: 10,
      }
      expect(hasMinimumDataQuality(metrics)).toBe(true)
    })

    it('should return false for insufficient days', () => {
      const metrics: DataQualityMetrics = {
        dataPoints: 5,
        impressions: 500,
        daysSpan: 5,
      }
      expect(hasMinimumDataQuality(metrics)).toBe(false)
    })

    it('should return false for insufficient impressions', () => {
      const metrics: DataQualityMetrics = {
        dataPoints: 10,
        impressions: 50,
        daysSpan: 10,
      }
      expect(hasMinimumDataQuality(metrics)).toBe(false)
    })

    it('should return true at minimum thresholds', () => {
      const metrics: DataQualityMetrics = {
        dataPoints: 7,
        impressions: 100,
        daysSpan: 7,
      }
      expect(hasMinimumDataQuality(metrics)).toBe(true)
    })
  })

  describe('CONFIDENCE_THRESHOLDS', () => {
    it('should have correct HIGH thresholds', () => {
      expect(CONFIDENCE_THRESHOLDS.HIGH.minDays).toBe(30)
      expect(CONFIDENCE_THRESHOLDS.HIGH.minImpressions).toBe(1000)
    })

    it('should have correct MEDIUM thresholds', () => {
      expect(CONFIDENCE_THRESHOLDS.MEDIUM.minDays).toBe(14)
      expect(CONFIDENCE_THRESHOLDS.MEDIUM.minImpressions).toBe(500)
    })

    it('should have correct LOW thresholds', () => {
      expect(CONFIDENCE_THRESHOLDS.LOW.minDays).toBe(0)
      expect(CONFIDENCE_THRESHOLDS.LOW.minImpressions).toBe(0)
    })
  })
})

describe('Edge Cases', () => {
  it('should handle very large impression counts', () => {
    const metrics: DataQualityMetrics = {
      dataPoints: 30,
      impressions: 100000000,
      daysSpan: 30,
    }
    expect(calculateConfidence(metrics)).toBe('HIGH')
    expect(calculateDataQualityScore(metrics)).toBe(100)
  })

  it('should handle fractional values from data processing', () => {
    const metrics: DataQualityMetrics = {
      dataPoints: 30.5, // Not typical but defensive
      impressions: 1000.7,
      daysSpan: 30.5,
    }
    // Should still work, treating as floor values
    expect(calculateConfidence(metrics)).toBe('HIGH')
  })

  it('should handle negative values gracefully', () => {
    const metrics: DataQualityMetrics = {
      dataPoints: -5,
      impressions: -100,
      daysSpan: -5,
    }
    // Should return LOW for invalid data
    expect(calculateConfidence(metrics)).toBe('LOW')
  })

  it('should handle optional conversionVariance', () => {
    const metrics: DataQualityMetrics = {
      dataPoints: 30,
      impressions: 1000,
      daysSpan: 30,
      conversionVariance: 0.5, // Optional field
    }
    // Should work regardless of variance value
    expect(calculateConfidence(metrics)).toBe('HIGH')
  })
})
