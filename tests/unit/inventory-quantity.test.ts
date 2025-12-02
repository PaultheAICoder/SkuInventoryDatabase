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
