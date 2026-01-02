import { describe, it, expect } from 'vitest'
import {
  classifyCampaign,
  isDiscoveryCampaign,
  isAccelerateCampaign,
  meetsGraduationThresholds,
  getGraduationEligibility,
  buildGraduationRationale,
  calculateGraduationImpact,
  type KeywordMetricsAggregate,
} from '@/services/recommendations/keyword-graduation'
import { DEFAULT_THRESHOLDS } from '@/lib/recommendation-utils'

describe('Campaign Classification', () => {
  describe('classifyCampaign', () => {
    it('should classify discovery campaigns by name', () => {
      expect(classifyCampaign('Discovery - Test Campaign')).toBe('discovery')
      expect(classifyCampaign('Research Keywords')).toBe('discovery')
      expect(classifyCampaign('SP_Explore_Auto')).toBe('discovery')
      expect(classifyCampaign('Test Campaign Q1')).toBe('discovery')
      expect(classifyCampaign('Broad Match Testing')).toBe('discovery')
    })

    it('should classify accelerate campaigns by name', () => {
      expect(classifyCampaign('Accelerate - Top Keywords')).toBe('accelerate')
      expect(classifyCampaign('Exact Match Campaign')).toBe('accelerate')
      expect(classifyCampaign('Scale Winners')).toBe('accelerate')
      expect(classifyCampaign('Performance Campaign')).toBe('accelerate')
      expect(classifyCampaign('Convert High Intent')).toBe('accelerate')
    })

    it('should return unknown for unrecognized patterns', () => {
      expect(classifyCampaign('Summer Sale Campaign')).toBe('unknown')
      expect(classifyCampaign('Product Launch')).toBe('unknown')
      expect(classifyCampaign('Brand Campaign')).toBe('unknown')
    })

    it('should be case-insensitive', () => {
      expect(classifyCampaign('DISCOVERY CAMPAIGN')).toBe('discovery')
      expect(classifyCampaign('discovery campaign')).toBe('discovery')
      expect(classifyCampaign('DiScOvErY Campaign')).toBe('discovery')
      expect(classifyCampaign('ACCELERATE CAMPAIGN')).toBe('accelerate')
      expect(classifyCampaign('accelerate campaign')).toBe('accelerate')
    })

    it('should consider targetingType for auto campaigns', () => {
      expect(classifyCampaign('Generic Campaign Name', 'auto')).toBe('discovery')
      expect(classifyCampaign('Generic Campaign Name', 'AUTO')).toBe('discovery')
      expect(classifyCampaign('Generic Campaign Name', 'manual')).toBe('unknown')
    })

    it('should prioritize name patterns over targeting type', () => {
      // If name says accelerate, that takes precedence
      expect(classifyCampaign('Accelerate Campaign', 'auto')).toBe('accelerate')
      // Discovery pattern in name wins
      expect(classifyCampaign('Discovery Campaign', 'manual')).toBe('discovery')
    })
  })

  describe('isDiscoveryCampaign', () => {
    it('should return true for discovery campaigns', () => {
      expect(isDiscoveryCampaign('Discovery - Keywords')).toBe(true)
      expect(isDiscoveryCampaign('Test Auto', 'auto')).toBe(true)
    })

    it('should return false for non-discovery campaigns', () => {
      expect(isDiscoveryCampaign('Accelerate - Scale')).toBe(false)
      expect(isDiscoveryCampaign('Random Campaign')).toBe(false)
    })
  })

  describe('isAccelerateCampaign', () => {
    it('should return true for accelerate campaigns', () => {
      expect(isAccelerateCampaign('Accelerate - Top')).toBe(true)
      expect(isAccelerateCampaign('Exact Match Winners')).toBe(true)
    })

    it('should return false for non-accelerate campaigns', () => {
      expect(isAccelerateCampaign('Discovery - Test')).toBe(false)
      expect(isAccelerateCampaign('Random Campaign')).toBe(false)
    })
  })
})

describe('Graduation Thresholds', () => {
  const createMetrics = (
    overrides: Partial<KeywordMetricsAggregate> = {}
  ): KeywordMetricsAggregate => ({
    keyword: 'test keyword',
    campaignId: 'campaign-1',
    campaignName: 'Discovery Campaign',
    matchType: 'broad',
    totalSpend: 100,
    totalOrders: 10,
    totalSales: 500,
    totalImpressions: 10000,
    totalClicks: 200,
    acos: 0.20, // 20% - good
    dataPoints: 30,
    ...overrides,
  })

  describe('meetsGraduationThresholds', () => {
    it('should return true when all thresholds met', () => {
      const metrics = createMetrics({
        acos: 0.20, // 20% < 25% max
        totalOrders: 10, // 10 >= 5 min
        totalSpend: 100, // $100 >= $50 min
      })
      expect(meetsGraduationThresholds(metrics, DEFAULT_THRESHOLDS)).toBe(true)
    })

    it('should return false when ACOS above threshold', () => {
      const metrics = createMetrics({
        acos: 0.30, // 30% > 25% max
        totalOrders: 10,
        totalSpend: 100,
      })
      expect(meetsGraduationThresholds(metrics, DEFAULT_THRESHOLDS)).toBe(false)
    })

    it('should return false when conversions below threshold', () => {
      const metrics = createMetrics({
        acos: 0.20,
        totalOrders: 3, // 3 < 5 min
        totalSpend: 100,
      })
      expect(meetsGraduationThresholds(metrics, DEFAULT_THRESHOLDS)).toBe(false)
    })

    it('should return false when spend below threshold', () => {
      const metrics = createMetrics({
        acos: 0.20,
        totalOrders: 10,
        totalSpend: 30, // $30 < $50 min
      })
      expect(meetsGraduationThresholds(metrics, DEFAULT_THRESHOLDS)).toBe(false)
    })

    it('should handle exact threshold values', () => {
      const metrics = createMetrics({
        acos: 0.25, // exactly at threshold
        totalOrders: 5, // exactly at threshold
        totalSpend: 50, // exactly at threshold
      })
      expect(meetsGraduationThresholds(metrics, DEFAULT_THRESHOLDS)).toBe(true)
    })

    it('should handle zero values', () => {
      const metrics = createMetrics({
        acos: 0,
        totalOrders: 0,
        totalSpend: 0,
      })
      expect(meetsGraduationThresholds(metrics, DEFAULT_THRESHOLDS)).toBe(false)
    })

    it('should work with custom thresholds', () => {
      const customThresholds = {
        graduation: {
          maxAcos: 0.15, // 15% max
          minConversions: 10,
          minSpend: 100,
        },
        negative: DEFAULT_THRESHOLDS.negative,
        budget: DEFAULT_THRESHOLDS.budget,
      }

      const metrics = createMetrics({
        acos: 0.20, // 20% > 15% max - fails
        totalOrders: 10,
        totalSpend: 100,
      })

      expect(meetsGraduationThresholds(metrics, customThresholds)).toBe(false)
    })
  })

  describe('getGraduationEligibility', () => {
    it('should return detailed eligibility breakdown', () => {
      const metrics = createMetrics({
        acos: 0.20,
        totalOrders: 10,
        totalSpend: 100,
      })

      const eligibility = getGraduationEligibility(metrics, DEFAULT_THRESHOLDS)

      expect(eligibility.eligible).toBe(true)
      expect(eligibility.acosBelowThreshold).toBe(true)
      expect(eligibility.meetsConversionMin).toBe(true)
      expect(eligibility.meetsSpendMin).toBe(true)
    })

    it('should show which criteria pass and fail', () => {
      const metrics = createMetrics({
        acos: 0.30, // fails
        totalOrders: 10, // passes
        totalSpend: 30, // fails
      })

      const eligibility = getGraduationEligibility(metrics, DEFAULT_THRESHOLDS)

      expect(eligibility.eligible).toBe(false)
      expect(eligibility.acosBelowThreshold).toBe(false)
      expect(eligibility.meetsConversionMin).toBe(true)
      expect(eligibility.meetsSpendMin).toBe(false)
    })

    it('should include current metrics and thresholds', () => {
      const metrics = createMetrics({
        acos: 0.18,
        totalOrders: 7,
        totalSpend: 75,
      })

      const eligibility = getGraduationEligibility(metrics, DEFAULT_THRESHOLDS)

      expect(eligibility.metrics.currentAcos).toBe(0.18)
      expect(eligibility.metrics.currentConversions).toBe(7)
      expect(eligibility.metrics.currentSpend).toBe(75)
      expect(eligibility.thresholds.maxAcos).toBe(0.25)
      expect(eligibility.thresholds.minConversions).toBe(5)
      expect(eligibility.thresholds.minSpend).toBe(50)
    })
  })
})

describe('Rationale Generation', () => {
  const createMetrics = (): KeywordMetricsAggregate => ({
    keyword: 'wireless charger',
    campaignId: 'campaign-1',
    campaignName: 'Discovery - Electronics',
    matchType: 'broad',
    totalSpend: 85.50,
    totalOrders: 12,
    totalSales: 462.00,
    totalImpressions: 15000,
    totalClicks: 340,
    acos: 0.185, // 18.5%
    dataPoints: 30,
  })

  describe('buildGraduationRationale', () => {
    it('should include keyword name', () => {
      const metrics = createMetrics()
      const eligibility = getGraduationEligibility(metrics, DEFAULT_THRESHOLDS)
      const rationale = buildGraduationRationale('wireless charger', metrics, eligibility)

      expect(rationale).toContain("'wireless charger'")
    })

    it('should include ACOS percentage', () => {
      const metrics = createMetrics()
      const eligibility = getGraduationEligibility(metrics, DEFAULT_THRESHOLDS)
      const rationale = buildGraduationRationale('wireless charger', metrics, eligibility)

      expect(rationale).toContain('18.5% ACOS')
    })

    it('should include conversion count', () => {
      const metrics = createMetrics()
      const eligibility = getGraduationEligibility(metrics, DEFAULT_THRESHOLDS)
      const rationale = buildGraduationRationale('wireless charger', metrics, eligibility)

      expect(rationale).toContain('12 conversions')
    })

    it('should include spend amount', () => {
      const metrics = createMetrics()
      const eligibility = getGraduationEligibility(metrics, DEFAULT_THRESHOLDS)
      const rationale = buildGraduationRationale('wireless charger', metrics, eligibility)

      expect(rationale).toContain('$85.50')
    })

    it('should include campaign name', () => {
      const metrics = createMetrics()
      const eligibility = getGraduationEligibility(metrics, DEFAULT_THRESHOLDS)
      const rationale = buildGraduationRationale('wireless charger', metrics, eligibility)

      expect(rationale).toContain("Discovery - Electronics")
    })

    it('should include data points', () => {
      const metrics = createMetrics()
      const eligibility = getGraduationEligibility(metrics, DEFAULT_THRESHOLDS)
      const rationale = buildGraduationRationale('wireless charger', metrics, eligibility)

      expect(rationale).toContain('30 days')
    })

    it('should handle singular conversion', () => {
      const metrics = { ...createMetrics(), totalOrders: 1 }
      const eligibility = getGraduationEligibility(metrics, DEFAULT_THRESHOLDS)
      const rationale = buildGraduationRationale('wireless charger', metrics, eligibility)

      expect(rationale).toContain('1 conversion')
      expect(rationale).not.toContain('1 conversions')
    })

    it('should handle singular day', () => {
      const metrics = { ...createMetrics(), dataPoints: 1 }
      const eligibility = getGraduationEligibility(metrics, DEFAULT_THRESHOLDS)
      const rationale = buildGraduationRationale('wireless charger', metrics, eligibility)

      expect(rationale).toContain('1 day')
      expect(rationale).not.toContain('1 days')
    })
  })

  describe('calculateGraduationImpact', () => {
    it('should return ACOS as the metric', () => {
      const metrics = createMetrics()
      const impact = calculateGraduationImpact(metrics)

      expect(impact.metric).toBe('acos')
    })

    it('should project 15% ACOS improvement', () => {
      const metrics = { ...createMetrics(), acos: 0.20 }
      const impact = calculateGraduationImpact(metrics)

      expect(impact.current).toBe(0.20)
      expect(impact.projected).toBeCloseTo(0.17, 2) // 0.20 * 0.85 = 0.17
    })

    it('should not project negative ACOS', () => {
      const metrics = { ...createMetrics(), acos: 0 }
      const impact = calculateGraduationImpact(metrics)

      expect(impact.projected).toBeGreaterThanOrEqual(0)
    })
  })
})

describe('Edge Cases', () => {
  it('should handle empty campaign names', () => {
    expect(classifyCampaign('')).toBe('unknown')
  })

  it('should handle very long campaign names', () => {
    const longName = 'Discovery ' + 'x'.repeat(1000)
    expect(classifyCampaign(longName)).toBe('discovery')
  })

  it('should handle special characters in campaign names', () => {
    expect(classifyCampaign('Discovery - [Brand] (Test)')).toBe('discovery')
    expect(classifyCampaign('Accelerate @ 100%')).toBe('accelerate')
  })

  it('should handle negative ACOS values (edge case)', () => {
    const metrics: KeywordMetricsAggregate = {
      keyword: 'test',
      campaignId: 'c1',
      campaignName: 'Test',
      matchType: 'broad',
      totalSpend: 0,
      totalOrders: 10,
      totalSales: 100,
      totalImpressions: 1000,
      totalClicks: 100,
      acos: -0.1, // Invalid but test handling
      dataPoints: 30,
    }

    // Should still pass threshold checks since -0.1 < 0.25
    expect(meetsGraduationThresholds(metrics, DEFAULT_THRESHOLDS)).toBe(false) // Fails spend check
  })

  it('should handle extremely high values', () => {
    const metrics: KeywordMetricsAggregate = {
      keyword: 'test',
      campaignId: 'c1',
      campaignName: 'Test',
      matchType: 'broad',
      totalSpend: 1000000,
      totalOrders: 100000,
      totalSales: 5000000,
      totalImpressions: 100000000,
      totalClicks: 1000000,
      acos: 0.20,
      dataPoints: 365,
    }

    expect(meetsGraduationThresholds(metrics, DEFAULT_THRESHOLDS)).toBe(true)
  })
})
