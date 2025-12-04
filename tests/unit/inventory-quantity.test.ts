/**
 * Unit tests for inventory quantity functions
 * Tests getComponentQuantity and getComponentQuantities
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

// Mock prisma before importing the service
vi.mock('@/lib/db', () => ({
  prisma: {
    transactionLine: {
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}))

import { getComponentQuantity, getComponentQuantities } from '@/services/inventory'
import { prisma } from '@/lib/db'

describe('getComponentQuantity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns sum of quantity changes for a component', async () => {
    vi.mocked(prisma.transactionLine.aggregate).mockResolvedValue({
      _sum: { quantityChange: new Prisma.Decimal(150) },
    } as never)

    const result = await getComponentQuantity('comp-1')
    expect(result).toBe(150)
    expect(prisma.transactionLine.aggregate).toHaveBeenCalledWith({
      where: { componentId: 'comp-1' },
      _sum: { quantityChange: true },
    })
  })

  it('returns 0 when no transactions exist', async () => {
    vi.mocked(prisma.transactionLine.aggregate).mockResolvedValue({
      _sum: { quantityChange: null },
    } as never)

    const result = await getComponentQuantity('comp-new')
    expect(result).toBe(0)
  })

  it('handles negative quantities (after builds)', async () => {
    vi.mocked(prisma.transactionLine.aggregate).mockResolvedValue({
      _sum: { quantityChange: new Prisma.Decimal(-25) },
    } as never)

    const result = await getComponentQuantity('comp-depleted')
    expect(result).toBe(-25)
  })

  it('handles large quantities', async () => {
    vi.mocked(prisma.transactionLine.aggregate).mockResolvedValue({
      _sum: { quantityChange: new Prisma.Decimal(1000000) },
    } as never)

    const result = await getComponentQuantity('comp-large')
    expect(result).toBe(1000000)
  })

  it('handles decimal quantities', async () => {
    vi.mocked(prisma.transactionLine.aggregate).mockResolvedValue({
      _sum: { quantityChange: new Prisma.Decimal(50.5) },
    } as never)

    const result = await getComponentQuantity('comp-decimal')
    expect(result).toBe(50.5)
  })
})

describe('getComponentQuantities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns quantities for multiple components', async () => {
    vi.mocked(prisma.transactionLine.groupBy).mockResolvedValue([
      { componentId: 'comp-1', _sum: { quantityChange: new Prisma.Decimal(100) } },
      { componentId: 'comp-2', _sum: { quantityChange: new Prisma.Decimal(50) } },
    ] as never)

    const result = await getComponentQuantities(['comp-1', 'comp-2', 'comp-3'])

    expect(result.get('comp-1')).toBe(100)
    expect(result.get('comp-2')).toBe(50)
    expect(result.get('comp-3')).toBe(0) // Not in results, defaults to 0
  })

  it('handles empty component list', async () => {
    vi.mocked(prisma.transactionLine.groupBy).mockResolvedValue([])

    const result = await getComponentQuantities([])
    expect(result.size).toBe(0)
  })

  it('returns 0 for components with no transactions', async () => {
    vi.mocked(prisma.transactionLine.groupBy).mockResolvedValue([])

    const result = await getComponentQuantities(['comp-new'])
    expect(result.get('comp-new')).toBe(0)
  })

  it('handles null quantity sums', async () => {
    vi.mocked(prisma.transactionLine.groupBy).mockResolvedValue([
      { componentId: 'comp-1', _sum: { quantityChange: null } },
    ] as never)

    const result = await getComponentQuantities(['comp-1'])
    expect(result.get('comp-1')).toBe(0)
  })

  it('preserves all requested component IDs in the result', async () => {
    vi.mocked(prisma.transactionLine.groupBy).mockResolvedValue([
      { componentId: 'comp-1', _sum: { quantityChange: new Prisma.Decimal(100) } },
    ] as never)

    const result = await getComponentQuantities(['comp-1', 'comp-2', 'comp-3', 'comp-4'])

    expect(result.size).toBe(4)
    expect(result.has('comp-1')).toBe(true)
    expect(result.has('comp-2')).toBe(true)
    expect(result.has('comp-3')).toBe(true)
    expect(result.has('comp-4')).toBe(true)
  })
})

describe('getComponentQuantity with locationId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns quantity at specific location', async () => {
    // Regular transactions at location
    vi.mocked(prisma.transactionLine.aggregate)
      .mockResolvedValueOnce({
        _sum: { quantityChange: new Prisma.Decimal(100) },
      } as never)
      // Transfer FROM (negative)
      .mockResolvedValueOnce({
        _sum: { quantityChange: new Prisma.Decimal(-20) },
      } as never)
      // Transfer TO (positive)
      .mockResolvedValueOnce({
        _sum: { quantityChange: new Prisma.Decimal(0) },
      } as never)

    const result = await getComponentQuantity('comp-1', 'loc-1')

    // 100 (regular) - 20 (transfer out) + 0 (transfer in) = 80
    expect(result).toBe(80)
    // First call: regular transactions
    expect(prisma.transactionLine.aggregate).toHaveBeenNthCalledWith(1, {
      where: {
        componentId: 'comp-1',
        transaction: {
          locationId: 'loc-1',
          type: { not: 'transfer' },
        },
      },
      _sum: { quantityChange: true },
    })
  })

  it('handles non-transfer transactions at location', async () => {
    vi.mocked(prisma.transactionLine.aggregate)
      .mockResolvedValueOnce({
        _sum: { quantityChange: new Prisma.Decimal(150) },
      } as never)
      .mockResolvedValueOnce({
        _sum: { quantityChange: null },
      } as never)
      .mockResolvedValueOnce({
        _sum: { quantityChange: null },
      } as never)

    const result = await getComponentQuantity('comp-1', 'loc-1')

    expect(result).toBe(150)
  })

  it('handles transfer FROM location (negative)', async () => {
    vi.mocked(prisma.transactionLine.aggregate)
      .mockResolvedValueOnce({
        _sum: { quantityChange: new Prisma.Decimal(100) },
      } as never)
      .mockResolvedValueOnce({
        _sum: { quantityChange: new Prisma.Decimal(-30) },
      } as never)
      .mockResolvedValueOnce({
        _sum: { quantityChange: null },
      } as never)

    const result = await getComponentQuantity('comp-1', 'loc-1')

    // 100 - 30 = 70
    expect(result).toBe(70)
  })

  it('handles transfer TO location (positive)', async () => {
    vi.mocked(prisma.transactionLine.aggregate)
      .mockResolvedValueOnce({
        _sum: { quantityChange: new Prisma.Decimal(50) },
      } as never)
      .mockResolvedValueOnce({
        _sum: { quantityChange: null },
      } as never)
      .mockResolvedValueOnce({
        _sum: { quantityChange: new Prisma.Decimal(25) },
      } as never)

    const result = await getComponentQuantity('comp-1', 'loc-1')

    // 50 + 25 = 75
    expect(result).toBe(75)
  })

  it('combines regular and transfer quantities correctly', async () => {
    vi.mocked(prisma.transactionLine.aggregate)
      .mockResolvedValueOnce({
        _sum: { quantityChange: new Prisma.Decimal(200) }, // Regular receipts
      } as never)
      .mockResolvedValueOnce({
        _sum: { quantityChange: new Prisma.Decimal(-50) }, // Transfer out
      } as never)
      .mockResolvedValueOnce({
        _sum: { quantityChange: new Prisma.Decimal(30) }, // Transfer in
      } as never)

    const result = await getComponentQuantity('comp-1', 'loc-1')

    // 200 - 50 + 30 = 180
    expect(result).toBe(180)
  })
})

describe('getComponentQuantities with locationId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns location-filtered quantities for multiple components', async () => {
    // Regular transactions
    vi.mocked(prisma.transactionLine.groupBy)
      .mockResolvedValueOnce([
        { componentId: 'comp-1', _sum: { quantityChange: new Prisma.Decimal(100) } },
        { componentId: 'comp-2', _sum: { quantityChange: new Prisma.Decimal(50) } },
      ] as never)
      // Transfer FROM
      .mockResolvedValueOnce([
        { componentId: 'comp-1', _sum: { quantityChange: new Prisma.Decimal(-20) } },
      ] as never)
      // Transfer TO
      .mockResolvedValueOnce([
        { componentId: 'comp-2', _sum: { quantityChange: new Prisma.Decimal(10) } },
      ] as never)

    const result = await getComponentQuantities(['comp-1', 'comp-2'], 'loc-1')

    // comp-1: 100 - 20 = 80
    expect(result.get('comp-1')).toBe(80)
    // comp-2: 50 + 10 = 60
    expect(result.get('comp-2')).toBe(60)
  })

  it('handles transfers correctly for each component', async () => {
    vi.mocked(prisma.transactionLine.groupBy)
      .mockResolvedValueOnce([
        { componentId: 'comp-1', _sum: { quantityChange: new Prisma.Decimal(200) } },
      ] as never)
      .mockResolvedValueOnce([
        { componentId: 'comp-1', _sum: { quantityChange: new Prisma.Decimal(-75) } },
      ] as never)
      .mockResolvedValueOnce([
        { componentId: 'comp-1', _sum: { quantityChange: new Prisma.Decimal(25) } },
      ] as never)

    const result = await getComponentQuantities(['comp-1'], 'loc-1')

    // 200 - 75 + 25 = 150
    expect(result.get('comp-1')).toBe(150)

    // Verify groupBy was called with location filter for regular transactions
    expect(prisma.transactionLine.groupBy).toHaveBeenNthCalledWith(1, {
      by: ['componentId'],
      where: {
        componentId: { in: ['comp-1'] },
        transaction: {
          locationId: 'loc-1',
          type: { not: 'transfer' },
        },
      },
      _sum: { quantityChange: true },
    })
  })
})

describe('Performance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queries component quantity across multiple locations efficiently', async () => {
    // Setup mock to simulate query completion
    vi.mocked(prisma.transactionLine.aggregate).mockResolvedValue({
      _sum: { quantityChange: new Prisma.Decimal(100) },
    } as never)

    const start = Date.now()
    await getComponentQuantity('comp-1')
    const duration = Date.now() - start

    // With mocks, this should be nearly instant (under 100ms)
    expect(duration).toBeLessThan(100)
  })

  it('batch queries 100 components efficiently', async () => {
    vi.mocked(prisma.transactionLine.groupBy).mockResolvedValue([])

    const componentIds = Array.from({ length: 100 }, (_, i) => `comp-${i}`)

    const start = Date.now()
    await getComponentQuantities(componentIds)
    const duration = Date.now() - start

    // With mocks, batch query should be fast (under 200ms)
    expect(duration).toBeLessThan(200)
  })
})
