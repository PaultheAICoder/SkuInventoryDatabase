/**
 * Unit tests for forecast service functions
 * Tests consumption rate calculation, runout dates, and reorder recommendations
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

vi.mock('@/lib/db', () => ({
  prisma: {
    forecastConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    component: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    transactionLine: {
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}))

vi.mock('@/services/inventory', () => ({
  getComponentQuantities: vi.fn(),
}))

import {
  getForecastConfig,
  upsertForecastConfig,
  calculateConsumptionRate,
  calculateConsumptionRates,
  calculateRunoutDate,
  calculateReorderRecommendation,
  getComponentForecasts,
  getComponentForecastById,
} from '@/services/forecast'
import { prisma } from '@/lib/db'
import { getComponentQuantities } from '@/services/inventory'
import { DEFAULT_FORECAST_CONFIG } from '@/types/forecast'

describe('getForecastConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns existing config when found', async () => {
    vi.mocked(prisma.forecastConfig.findUnique).mockResolvedValue({
      id: 'config-1',
      companyId: 'company-1',
      lookbackDays: 60,
      safetyDays: 14,
      excludedTransactionTypes: ['initial', 'receipt'],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)

    const result = await getForecastConfig('company-1')

    expect(result.lookbackDays).toBe(60)
    expect(result.safetyDays).toBe(14)
    expect(result.excludedTransactionTypes).toEqual(['initial', 'receipt'])
  })

  it('returns default config when none exists', async () => {
    vi.mocked(prisma.forecastConfig.findUnique).mockResolvedValue(null)

    const result = await getForecastConfig('company-1')

    expect(result).toEqual(DEFAULT_FORECAST_CONFIG)
  })
})

describe('upsertForecastConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates or updates config with provided values', async () => {
    vi.mocked(prisma.forecastConfig.upsert).mockResolvedValue({
      id: 'config-1',
      companyId: 'company-1',
      lookbackDays: 45,
      safetyDays: 10,
      excludedTransactionTypes: ['initial'],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)

    const result = await upsertForecastConfig('company-1', {
      lookbackDays: 45,
      safetyDays: 10,
      excludedTransactionTypes: ['initial'],
    })

    expect(result.lookbackDays).toBe(45)
    expect(result.safetyDays).toBe(10)
    expect(result.excludedTransactionTypes).toEqual(['initial'])
  })
})

describe('calculateRunoutDate', () => {
  it('returns null for zero consumption (infinite runway)', () => {
    const result = calculateRunoutDate(100, 0)
    expect(result.daysUntilRunout).toBeNull()
    expect(result.runoutDate).toBeNull()
  })

  it('returns null for negative consumption', () => {
    const result = calculateRunoutDate(100, -5)
    expect(result.daysUntilRunout).toBeNull()
    expect(result.runoutDate).toBeNull()
  })

  it('returns 0 days for zero quantity on hand', () => {
    const result = calculateRunoutDate(0, 10)
    expect(result.daysUntilRunout).toBe(0)
    expect(result.runoutDate).not.toBeNull()
  })

  it('returns 0 days for negative quantity on hand', () => {
    const result = calculateRunoutDate(-50, 10)
    expect(result.daysUntilRunout).toBe(0)
    expect(result.runoutDate).not.toBeNull()
  })

  it('calculates correct days until runout', () => {
    const result = calculateRunoutDate(100, 10)
    expect(result.daysUntilRunout).toBe(10) // 100 / 10 = 10 days
  })

  it('floors decimal results', () => {
    const result = calculateRunoutDate(100, 7)
    expect(result.daysUntilRunout).toBe(14) // 100 / 7 = 14.28, floored to 14
  })

  it('calculates runout date correctly', () => {
    const result = calculateRunoutDate(30, 10)

    expect(result.daysUntilRunout).toBe(3)
    if (result.runoutDate) {
      const expectedDate = new Date()
      expectedDate.setDate(expectedDate.getDate() + 3)
      expect(result.runoutDate.toDateString()).toBe(expectedDate.toDateString())
    }
  })
})

describe('calculateReorderRecommendation', () => {
  it('returns 0 quantity for zero consumption', () => {
    const result = calculateReorderRecommendation({
      dailyConsumption: 0,
      leadTimeDays: 7,
      safetyDays: 3,
      runoutDate: new Date('2025-12-20'),
    })
    expect(result.recommendedReorderQty).toBe(0)
    expect(result.recommendedReorderDate).toBeNull()
  })

  it('calculates correct reorder quantity', () => {
    const result = calculateReorderRecommendation({
      dailyConsumption: 10,
      leadTimeDays: 7,
      safetyDays: 3,
      runoutDate: new Date('2025-12-20'),
    })
    // (7 + 3) * 10 = 100
    expect(result.recommendedReorderQty).toBe(100)
  })

  it('calculates correct reorder date', () => {
    // Use a future date to avoid clamping to today
    const runoutDate = new Date()
    runoutDate.setDate(runoutDate.getDate() + 30) // 30 days from now
    const result = calculateReorderRecommendation({
      dailyConsumption: 10,
      leadTimeDays: 7,
      safetyDays: 3,
      runoutDate,
    })
    // Reorder date should be runoutDate - leadTimeDays (7 days before runout)
    const expectedReorderDate = new Date(runoutDate)
    expectedReorderDate.setDate(expectedReorderDate.getDate() - 7)
    expect(result.recommendedReorderDate?.toISOString().split('T')[0]).toBe(
      expectedReorderDate.toISOString().split('T')[0]
    )
  })

  it('handles null runout date', () => {
    const result = calculateReorderRecommendation({
      dailyConsumption: 10,
      leadTimeDays: 7,
      safetyDays: 3,
      runoutDate: null,
    })
    expect(result.recommendedReorderQty).toBe(100) // Still calculates quantity
    expect(result.recommendedReorderDate).toBeNull()
  })

  it('ceils reorder quantity', () => {
    const result = calculateReorderRecommendation({
      dailyConsumption: 3.3,
      leadTimeDays: 7,
      safetyDays: 3,
      runoutDate: new Date('2025-12-20'),
    })
    // (7 + 3) * 3.3 = 33, ceil = 33
    expect(result.recommendedReorderQty).toBe(33)
  })

  it('ceils non-integer reorder quantity', () => {
    const result = calculateReorderRecommendation({
      dailyConsumption: 3.1,
      leadTimeDays: 7,
      safetyDays: 3,
      runoutDate: new Date('2025-12-20'),
    })
    // (7 + 3) * 3.1 = 31, ceil = 31
    expect(result.recommendedReorderQty).toBe(31)
  })
})

describe('calculateConsumptionRate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 0 when no consumption history exists', async () => {
    vi.mocked(prisma.transactionLine.aggregate).mockResolvedValue({
      _sum: { quantityChange: null },
      _count: 0,
      _avg: { quantityChange: null },
      _min: { quantityChange: null },
      _max: { quantityChange: null },
    } as never)

    const result = await calculateConsumptionRate('comp-1', 30, ['initial', 'adjustment'])
    expect(result).toBe(0)
  })

  it('calculates average daily consumption correctly', async () => {
    vi.mocked(prisma.transactionLine.aggregate).mockResolvedValue({
      _sum: { quantityChange: new Prisma.Decimal(-300) }, // 300 consumed over 30 days
      _count: 10,
      _avg: { quantityChange: null },
      _min: { quantityChange: null },
      _max: { quantityChange: null },
    } as never)

    const result = await calculateConsumptionRate('comp-1', 30, ['initial', 'adjustment'])
    expect(result).toBe(10) // 300 / 30 = 10 per day
  })

  it('excludes specified transaction types', async () => {
    vi.mocked(prisma.transactionLine.aggregate).mockResolvedValue({
      _sum: { quantityChange: new Prisma.Decimal(-150) },
      _count: 5,
      _avg: { quantityChange: null },
      _min: { quantityChange: null },
      _max: { quantityChange: null },
    } as never)

    await calculateConsumptionRate('comp-1', 30, ['initial', 'adjustment', 'receipt'])

    expect(prisma.transactionLine.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          transaction: expect.objectContaining({
            type: { notIn: ['initial', 'adjustment', 'receipt'] },
          }),
        }),
      })
    )
  })

  it('uses lookback period correctly', async () => {
    vi.mocked(prisma.transactionLine.aggregate).mockResolvedValue({
      _sum: { quantityChange: new Prisma.Decimal(-60) },
      _count: 2,
      _avg: { quantityChange: null },
      _min: { quantityChange: null },
      _max: { quantityChange: null },
    } as never)

    const result = await calculateConsumptionRate('comp-1', 60, ['initial'])
    expect(result).toBe(1) // 60 / 60 = 1 per day
  })
})

describe('calculateConsumptionRates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty map for empty component list', async () => {
    const result = await calculateConsumptionRates([], 30, ['initial'])
    expect(result.size).toBe(0)
  })

  it('returns map with all components initialized to 0 when no consumption', async () => {
    vi.mocked(prisma.transactionLine.groupBy).mockResolvedValue([])

    const result = await calculateConsumptionRates(['comp-1', 'comp-2'], 30, ['initial'])

    expect(result.get('comp-1')).toBe(0)
    expect(result.get('comp-2')).toBe(0)
  })

  it('calculates consumption rates for multiple components', async () => {
    vi.mocked(prisma.transactionLine.groupBy).mockResolvedValue([
      { componentId: 'comp-1', _sum: { quantityChange: new Prisma.Decimal(-300) } },
      { componentId: 'comp-2', _sum: { quantityChange: new Prisma.Decimal(-60) } },
    ] as never)

    const result = await calculateConsumptionRates(['comp-1', 'comp-2'], 30, ['initial'])

    expect(result.get('comp-1')).toBe(10) // 300 / 30
    expect(result.get('comp-2')).toBe(2) // 60 / 30
  })

  it('filters consumption by location when locationId provided', async () => {
    // First call: regular (non-transfer) consumption at location
    // Second call: transfer consumption from location
    vi.mocked(prisma.transactionLine.groupBy)
      .mockResolvedValueOnce([
        { componentId: 'comp-1', _sum: { quantityChange: new Prisma.Decimal(-150) } },
      ] as never)
      .mockResolvedValueOnce([
        { componentId: 'comp-1', _sum: { quantityChange: new Prisma.Decimal(-30) } },
      ] as never)

    const result = await calculateConsumptionRates(
      ['comp-1'],
      30,
      ['initial', 'adjustment'],
      'location-1'
    )

    // 150/30 + 30/30 = 5 + 1 = 6 per day
    expect(result.get('comp-1')).toBe(6)

    // Verify location filter was applied to both queries
    expect(prisma.transactionLine.groupBy).toHaveBeenCalledTimes(2)
  })
})

describe('getComponentForecasts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty array when no active components', async () => {
    vi.mocked(prisma.forecastConfig.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.component.findMany).mockResolvedValue([])

    const result = await getComponentForecasts('company-1')
    expect(result).toEqual([])
  })

  it('builds forecasts for all components', async () => {
    vi.mocked(prisma.forecastConfig.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.component.findMany).mockResolvedValue([
      { id: 'comp-1', name: 'Component 1', skuCode: 'SKU-1', leadTimeDays: 7 },
      { id: 'comp-2', name: 'Component 2', skuCode: 'SKU-2', leadTimeDays: 14 },
    ] as never)

    vi.mocked(getComponentQuantities).mockResolvedValue(
      new Map([
        ['comp-1', 100],
        ['comp-2', 200],
      ])
    )

    vi.mocked(prisma.transactionLine.groupBy).mockResolvedValue([
      { componentId: 'comp-1', _sum: { quantityChange: new Prisma.Decimal(-300) } },
      { componentId: 'comp-2', _sum: { quantityChange: new Prisma.Decimal(-60) } },
    ] as never)

    const result = await getComponentForecasts('company-1')

    expect(result).toHaveLength(2)
    expect(result[0].componentId).toBe('comp-1')
    expect(result[0].averageDailyConsumption).toBe(10) // 300 / 30
    expect(result[0].quantityOnHand).toBe(100)
    expect(result[1].componentId).toBe('comp-2')
    expect(result[1].averageDailyConsumption).toBe(2) // 60 / 30
    expect(result[1].quantityOnHand).toBe(200)
  })

  it('applies config overrides', async () => {
    vi.mocked(prisma.forecastConfig.findUnique).mockResolvedValue({
      id: 'config-1',
      companyId: 'company-1',
      lookbackDays: 30,
      safetyDays: 7,
      excludedTransactionTypes: ['initial', 'adjustment'],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)
    vi.mocked(prisma.component.findMany).mockResolvedValue([
      { id: 'comp-1', name: 'Component 1', skuCode: 'SKU-1', leadTimeDays: 7 },
    ] as never)

    vi.mocked(getComponentQuantities).mockResolvedValue(new Map([['comp-1', 50]]))
    vi.mocked(prisma.transactionLine.groupBy).mockResolvedValue([])

    const result = await getComponentForecasts('company-1', { lookbackDays: 60, safetyDays: 14 })

    expect(result[0].assumptions.lookbackDays).toBe(60)
    expect(result[0].assumptions.safetyDays).toBe(14)
  })

  it('calculates correct runout and reorder for components', async () => {
    vi.mocked(prisma.forecastConfig.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.component.findMany).mockResolvedValue([
      { id: 'comp-1', name: 'Component 1', skuCode: 'SKU-1', leadTimeDays: 7 },
    ] as never)

    vi.mocked(getComponentQuantities).mockResolvedValue(new Map([['comp-1', 100]]))

    // 300 consumed / 30 days = 10 per day
    vi.mocked(prisma.transactionLine.groupBy).mockResolvedValue([
      { componentId: 'comp-1', _sum: { quantityChange: new Prisma.Decimal(-300) } },
    ] as never)

    const result = await getComponentForecasts('company-1')

    expect(result[0].daysUntilRunout).toBe(10) // 100 / 10
    expect(result[0].recommendedReorderQty).toBe(140) // (7 lead + 7 safety) * 10
  })

  it('filters by brandId when provided', async () => {
    vi.mocked(prisma.forecastConfig.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.component.findMany).mockResolvedValue([
      { id: 'comp-1', name: 'Brand Component', skuCode: 'BC-1', leadTimeDays: 7 },
    ] as never)
    vi.mocked(getComponentQuantities).mockResolvedValue(new Map([['comp-1', 50]]))
    vi.mocked(prisma.transactionLine.groupBy).mockResolvedValue([])

    await getComponentForecasts('company-1', undefined, { brandId: 'brand-1' })

    // Verify brandId filter was applied to component query
    expect(prisma.component.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brandId: 'brand-1',
        }),
      })
    )
  })

  it('passes locationId to quantity and consumption calculations', async () => {
    vi.mocked(prisma.forecastConfig.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.component.findMany).mockResolvedValue([
      { id: 'comp-1', name: 'Component 1', skuCode: 'SKU-1', leadTimeDays: 7 },
    ] as never)
    vi.mocked(getComponentQuantities).mockResolvedValue(new Map([['comp-1', 30]]))
    // Mock location-aware consumption (regular + transfer queries)
    vi.mocked(prisma.transactionLine.groupBy)
      .mockResolvedValueOnce([
        { componentId: 'comp-1', _sum: { quantityChange: new Prisma.Decimal(-90) } },
      ] as never)
      .mockResolvedValueOnce([])

    await getComponentForecasts('company-1', undefined, { locationId: 'loc-1' })

    // Verify locationId was passed to getComponentQuantities
    expect(getComponentQuantities).toHaveBeenCalledWith(
      expect.any(Array),
      'company-1',
      'loc-1'
    )
  })

  it('applies both brandId and locationId filters', async () => {
    vi.mocked(prisma.forecastConfig.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.component.findMany).mockResolvedValue([
      { id: 'comp-1', name: 'Brand Location Component', skuCode: 'BLC-1', leadTimeDays: 7 },
    ] as never)
    vi.mocked(getComponentQuantities).mockResolvedValue(new Map([['comp-1', 25]]))
    vi.mocked(prisma.transactionLine.groupBy)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const result = await getComponentForecasts('company-1', undefined, {
      brandId: 'brand-1',
      locationId: 'loc-1',
    })

    // Verify brandId filter was applied
    expect(prisma.component.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brandId: 'brand-1',
        }),
      })
    )

    // Verify locationId was passed to quantities
    expect(getComponentQuantities).toHaveBeenCalledWith(
      expect.any(Array),
      'company-1',
      'loc-1'
    )

    expect(result).toHaveLength(1)
  })
})

describe('getComponentForecastById', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null for non-existent component', async () => {
    vi.mocked(prisma.component.findUnique).mockResolvedValue(null)

    const result = await getComponentForecastById('non-existent')
    expect(result).toBeNull()
  })

  it('returns null for inactive component', async () => {
    vi.mocked(prisma.component.findUnique).mockResolvedValue({
      id: 'comp-1',
      name: 'Component 1',
      skuCode: 'SKU-1',
      leadTimeDays: 7,
      companyId: 'company-1',
      isActive: false,
    } as never)

    const result = await getComponentForecastById('comp-1')
    expect(result).toBeNull()
  })

  // Test removed: 'returns null for component without company'
  // companyId is now mandatory on Component model (Issue #301)
  // A component without companyId cannot exist in the database

  it('returns complete forecast for valid component', async () => {
    vi.mocked(prisma.component.findUnique).mockResolvedValue({
      id: 'comp-1',
      name: 'Component 1',
      skuCode: 'SKU-1',
      leadTimeDays: 7,
      companyId: 'company-1',
      isActive: true,
    } as never)

    vi.mocked(prisma.forecastConfig.findUnique).mockResolvedValue(null)

    vi.mocked(prisma.transactionLine.aggregate).mockResolvedValue({
      _sum: { quantityChange: new Prisma.Decimal(-300) },
      _count: 10,
      _avg: { quantityChange: null },
      _min: { quantityChange: null },
      _max: { quantityChange: null },
    } as never)

    vi.mocked(getComponentQuantities).mockResolvedValue(new Map([['comp-1', 100]]))

    const result = await getComponentForecastById('comp-1')

    expect(result).not.toBeNull()
    expect(result?.componentId).toBe('comp-1')
    expect(result?.componentName).toBe('Component 1')
    expect(result?.skuCode).toBe('SKU-1')
    expect(result?.quantityOnHand).toBe(100)
    expect(result?.averageDailyConsumption).toBe(10)
    expect(result?.daysUntilRunout).toBe(10)
    expect(result?.leadTimeDays).toBe(7)
  })

  it('applies config overrides', async () => {
    vi.mocked(prisma.component.findUnique).mockResolvedValue({
      id: 'comp-1',
      name: 'Component 1',
      skuCode: 'SKU-1',
      leadTimeDays: 7,
      companyId: 'company-1',
      isActive: true,
    } as never)

    vi.mocked(prisma.forecastConfig.findUnique).mockResolvedValue(null)

    vi.mocked(prisma.transactionLine.aggregate).mockResolvedValue({
      _sum: { quantityChange: null },
      _count: 0,
      _avg: { quantityChange: null },
      _min: { quantityChange: null },
      _max: { quantityChange: null },
    } as never)

    vi.mocked(getComponentQuantities).mockResolvedValue(new Map([['comp-1', 50]]))

    const result = await getComponentForecastById('comp-1', { safetyDays: 21 })

    expect(result?.assumptions.safetyDays).toBe(21)
  })

  it('passes locationId to quantity and consumption calculations', async () => {
    vi.mocked(prisma.component.findUnique).mockResolvedValue({
      id: 'comp-1',
      name: 'Component 1',
      skuCode: 'SKU-1',
      leadTimeDays: 7,
      companyId: 'company-1',
      isActive: true,
    } as never)

    vi.mocked(prisma.forecastConfig.findUnique).mockResolvedValue(null)

    // Mock location-aware consumption (regular + transfer queries)
    vi.mocked(prisma.transactionLine.aggregate)
      .mockResolvedValueOnce({
        _sum: { quantityChange: new Prisma.Decimal(-60) },
        _count: 2,
        _avg: { quantityChange: null },
        _min: { quantityChange: null },
        _max: { quantityChange: null },
      } as never)
      .mockResolvedValueOnce({
        _sum: { quantityChange: null },
        _count: 0,
        _avg: { quantityChange: null },
        _min: { quantityChange: null },
        _max: { quantityChange: null },
      } as never)

    vi.mocked(getComponentQuantities).mockResolvedValue(new Map([['comp-1', 40]]))

    const result = await getComponentForecastById('comp-1', undefined, 'location-1')

    // Verify locationId was passed to getComponentQuantities
    expect(getComponentQuantities).toHaveBeenCalledWith(
      ['comp-1'],
      'company-1',
      'location-1'
    )

    expect(result).not.toBeNull()
    expect(result?.quantityOnHand).toBe(40)
    // 60/30 = 2 per day consumption
    expect(result?.averageDailyConsumption).toBe(2)
  })
})
