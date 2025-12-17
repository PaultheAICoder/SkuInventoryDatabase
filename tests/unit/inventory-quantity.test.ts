/**
 * Unit tests for inventory quantity functions
 * Tests getComponentQuantity and getComponentQuantities using InventoryBalance table
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

// Mock prisma before importing the service
vi.mock('@/lib/db', () => ({
  prisma: {
    inventoryBalance: {
      aggregate: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    component: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

import { getComponentQuantity, getComponentQuantities } from '@/services/inventory'
import { prisma } from '@/lib/db'

describe('getComponentQuantity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: component exists and belongs to company
    vi.mocked(prisma.component.findFirst).mockResolvedValue({ id: 'comp-1' } as never)
  })

  it('returns sum of quantity changes for a component', async () => {
    // Global quantity uses aggregate
    vi.mocked(prisma.inventoryBalance.aggregate).mockResolvedValue({
      _sum: { quantity: new Prisma.Decimal(150) },
    } as never)

    const result = await getComponentQuantity('comp-1', 'company-1')
    expect(result).toBe(150)
    expect(prisma.inventoryBalance.aggregate).toHaveBeenCalledWith({
      where: { componentId: 'comp-1' },
      _sum: { quantity: true },
    })
  })

  it('returns 0 when no transactions exist', async () => {
    vi.mocked(prisma.inventoryBalance.aggregate).mockResolvedValue({
      _sum: { quantity: null },
    } as never)

    const result = await getComponentQuantity('comp-new', 'company-1')
    expect(result).toBe(0)
  })

  it('handles negative quantities (after builds)', async () => {
    vi.mocked(prisma.inventoryBalance.aggregate).mockResolvedValue({
      _sum: { quantity: new Prisma.Decimal(-25) },
    } as never)

    const result = await getComponentQuantity('comp-depleted', 'company-1')
    expect(result).toBe(-25)
  })

  it('handles large quantities', async () => {
    vi.mocked(prisma.inventoryBalance.aggregate).mockResolvedValue({
      _sum: { quantity: new Prisma.Decimal(1000000) },
    } as never)

    const result = await getComponentQuantity('comp-large', 'company-1')
    expect(result).toBe(1000000)
  })

  it('handles decimal quantities', async () => {
    vi.mocked(prisma.inventoryBalance.aggregate).mockResolvedValue({
      _sum: { quantity: new Prisma.Decimal(50.5) },
    } as never)

    const result = await getComponentQuantity('comp-decimal', 'company-1')
    expect(result).toBe(50.5)
  })
})

describe('getComponentQuantities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: all requested components exist and belong to company
    vi.mocked(prisma.component.findMany).mockImplementation(((args: { where?: { id?: { in: string[] } } }) => {
      const ids = args?.where?.id?.in ?? []
      return Promise.resolve(ids.map(id => ({ id })))
    }) as never)
  })

  it('returns quantities for multiple components', async () => {
    // Global quantity uses groupBy
    vi.mocked(prisma.inventoryBalance.groupBy).mockResolvedValue([
      { componentId: 'comp-1', _sum: { quantity: new Prisma.Decimal(100) } },
      { componentId: 'comp-2', _sum: { quantity: new Prisma.Decimal(50) } },
    ] as never)

    const result = await getComponentQuantities(['comp-1', 'comp-2', 'comp-3'], 'company-1')

    expect(result.get('comp-1')).toBe(100)
    expect(result.get('comp-2')).toBe(50)
    expect(result.get('comp-3')).toBe(0) // Not in results, defaults to 0
  })

  it('handles empty component list', async () => {
    const result = await getComponentQuantities([], 'company-1')
    expect(result.size).toBe(0)
    // groupBy should not be called for empty list
    expect(prisma.inventoryBalance.groupBy).not.toHaveBeenCalled()
  })

  it('returns 0 for components with no transactions', async () => {
    vi.mocked(prisma.inventoryBalance.groupBy).mockResolvedValue([])

    const result = await getComponentQuantities(['comp-new'], 'company-1')
    expect(result.get('comp-new')).toBe(0)
  })

  it('handles null quantity sums', async () => {
    vi.mocked(prisma.inventoryBalance.groupBy).mockResolvedValue([
      { componentId: 'comp-1', _sum: { quantity: null } },
    ] as never)

    const result = await getComponentQuantities(['comp-1'], 'company-1')
    expect(result.get('comp-1')).toBe(0)
  })

  it('preserves all requested component IDs in the result', async () => {
    vi.mocked(prisma.inventoryBalance.groupBy).mockResolvedValue([
      { componentId: 'comp-1', _sum: { quantity: new Prisma.Decimal(100) } },
    ] as never)

    const result = await getComponentQuantities(['comp-1', 'comp-2', 'comp-3', 'comp-4'], 'company-1')

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
    // Default: component exists and belongs to company
    vi.mocked(prisma.component.findFirst).mockResolvedValue({ id: 'comp-1' } as never)
  })

  it('returns quantity at specific location', async () => {
    // Location-specific uses findUnique with composite key
    vi.mocked(prisma.inventoryBalance.findUnique).mockResolvedValue({
      quantity: new Prisma.Decimal(80),
    } as never)

    const result = await getComponentQuantity('comp-1', 'company-1', 'loc-1')

    expect(result).toBe(80)
    expect(prisma.inventoryBalance.findUnique).toHaveBeenCalledWith({
      where: {
        componentId_locationId: {
          componentId: 'comp-1',
          locationId: 'loc-1',
        },
      },
      select: { quantity: true },
    })
  })

  it('handles non-transfer transactions at location', async () => {
    vi.mocked(prisma.inventoryBalance.findUnique).mockResolvedValue({
      quantity: new Prisma.Decimal(150),
    } as never)

    const result = await getComponentQuantity('comp-1', 'company-1', 'loc-1')

    expect(result).toBe(150)
  })

  it('handles transfer FROM location (negative)', async () => {
    // Balance after transfers out would be lower
    vi.mocked(prisma.inventoryBalance.findUnique).mockResolvedValue({
      quantity: new Prisma.Decimal(70),
    } as never)

    const result = await getComponentQuantity('comp-1', 'company-1', 'loc-1')

    expect(result).toBe(70)
  })

  it('handles transfer TO location (positive)', async () => {
    // Balance after transfers in would be higher
    vi.mocked(prisma.inventoryBalance.findUnique).mockResolvedValue({
      quantity: new Prisma.Decimal(75),
    } as never)

    const result = await getComponentQuantity('comp-1', 'company-1', 'loc-1')

    expect(result).toBe(75)
  })

  it('combines regular and transfer quantities correctly', async () => {
    // Balance table already combines all transaction types
    vi.mocked(prisma.inventoryBalance.findUnique).mockResolvedValue({
      quantity: new Prisma.Decimal(180),
    } as never)

    const result = await getComponentQuantity('comp-1', 'company-1', 'loc-1')

    expect(result).toBe(180)
  })

  it('returns 0 when no balance exists at location', async () => {
    vi.mocked(prisma.inventoryBalance.findUnique).mockResolvedValue(null)

    const result = await getComponentQuantity('comp-1', 'company-1', 'loc-1')

    expect(result).toBe(0)
  })
})

describe('getComponentQuantities with locationId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: all requested components exist and belong to company
    vi.mocked(prisma.component.findMany).mockImplementation(((args: { where?: { id?: { in: string[] } } }) => {
      const ids = args?.where?.id?.in ?? []
      return Promise.resolve(ids.map(id => ({ id })))
    }) as never)
  })

  it('returns location-filtered quantities for multiple components', async () => {
    // Location-specific uses findMany
    vi.mocked(prisma.inventoryBalance.findMany).mockResolvedValue([
      { componentId: 'comp-1', quantity: new Prisma.Decimal(80) },
      { componentId: 'comp-2', quantity: new Prisma.Decimal(60) },
    ] as never)

    const result = await getComponentQuantities(['comp-1', 'comp-2'], 'company-1', 'loc-1')

    expect(result.get('comp-1')).toBe(80)
    expect(result.get('comp-2')).toBe(60)
  })

  it('handles transfers correctly for each component', async () => {
    // Balance table already accounts for all transfers
    vi.mocked(prisma.inventoryBalance.findMany).mockResolvedValue([
      { componentId: 'comp-1', quantity: new Prisma.Decimal(150) },
    ] as never)

    const result = await getComponentQuantities(['comp-1'], 'company-1', 'loc-1')

    expect(result.get('comp-1')).toBe(150)

    // Verify findMany was called with location filter
    expect(prisma.inventoryBalance.findMany).toHaveBeenCalledWith({
      where: {
        componentId: { in: ['comp-1'] },
        locationId: 'loc-1',
      },
      select: { componentId: true, quantity: true },
    })
  })

  it('returns 0 for components without balance at location', async () => {
    vi.mocked(prisma.inventoryBalance.findMany).mockResolvedValue([
      { componentId: 'comp-1', quantity: new Prisma.Decimal(100) },
    ] as never)

    const result = await getComponentQuantities(['comp-1', 'comp-2'], 'company-1', 'loc-1')

    expect(result.get('comp-1')).toBe(100)
    expect(result.get('comp-2')).toBe(0) // No balance at this location
  })
})

describe('Performance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: component exists and belongs to company
    vi.mocked(prisma.component.findFirst).mockResolvedValue({ id: 'comp-1' } as never)
    vi.mocked(prisma.component.findMany).mockImplementation(((args: { where?: { id?: { in: string[] } } }) => {
      const ids = args?.where?.id?.in ?? []
      return Promise.resolve(ids.map(id => ({ id })))
    }) as never)
  })

  it('queries component quantity across multiple locations efficiently', async () => {
    // Setup mock to simulate query completion
    vi.mocked(prisma.inventoryBalance.aggregate).mockResolvedValue({
      _sum: { quantity: new Prisma.Decimal(100) },
    } as never)

    const start = Date.now()
    await getComponentQuantity('comp-1', 'company-1')
    const duration = Date.now() - start

    // With mocks and O(1) lookup, this should be nearly instant (under 100ms)
    expect(duration).toBeLessThan(100)
  })

  it('batch queries 100 components efficiently', async () => {
    vi.mocked(prisma.inventoryBalance.groupBy).mockResolvedValue([])

    const componentIds = Array.from({ length: 100 }, (_, i) => `comp-${i}`)

    const start = Date.now()
    await getComponentQuantities(componentIds, 'company-1')
    const duration = Date.now() - start

    // With mocks, batch query should be fast (under 200ms)
    expect(duration).toBeLessThan(200)
  })
})

describe('Multi-tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getComponentQuantity throws for component from different company', async () => {
    // Mock component lookup to return null (not found)
    vi.mocked(prisma.component.findFirst).mockResolvedValue(null)

    await expect(
      getComponentQuantity('comp-1', 'company-different')
    ).rejects.toThrow('Component not found or access denied')
  })

  it('getComponentQuantities filters out components from different companies', async () => {
    // Mock component lookup to return only some valid components
    vi.mocked(prisma.component.findMany).mockResolvedValue([
      { id: 'comp-1' }
    ] as never)

    vi.mocked(prisma.inventoryBalance.groupBy).mockResolvedValue([
      { componentId: 'comp-1', _sum: { quantity: new Prisma.Decimal(100) } }
    ] as never)

    const result = await getComponentQuantities(['comp-1', 'comp-2'], 'company-1')

    // comp-1 should have real quantity, comp-2 (not owned) should have 0
    expect(result.get('comp-1')).toBe(100)
    expect(result.get('comp-2')).toBe(0)
  })

  it('getComponentQuantities returns zeros for all when no components owned', async () => {
    // Mock component lookup to return empty (no valid components)
    vi.mocked(prisma.component.findMany).mockResolvedValue([])

    const result = await getComponentQuantities(['comp-1', 'comp-2'], 'company-1')

    // All should be 0 since no valid components
    expect(result.get('comp-1')).toBe(0)
    expect(result.get('comp-2')).toBe(0)
    expect(result.size).toBe(2)
  })
})
