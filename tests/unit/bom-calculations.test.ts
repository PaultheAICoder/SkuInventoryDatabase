/**
 * Unit tests for BOM calculation functions
 * Tests calculateBOMUnitCost, calculateBOMUnitCosts, calculateMaxBuildableUnits, and calculateLineCosts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

// Test company ID for multi-tenancy enforcement
const TEST_COMPANY_ID = 'company-1'

vi.mock('@/lib/db', () => ({
  prisma: {
    bOMLine: {
      findMany: vi.fn(),
    },
    bOMVersion: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    transactionLine: {
      groupBy: vi.fn(),
    },
    component: {
      findMany: vi.fn(),
    },
  },
}))

import {
  calculateBOMUnitCost,
  calculateBOMUnitCosts,
  calculateMaxBuildableUnits,
  calculateLineCosts,
} from '@/services/bom'
import { prisma } from '@/lib/db'

describe('calculateBOMUnitCost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calculates unit cost as sum of (component cost * quantity per unit)', async () => {
    vi.mocked(prisma.bOMLine.findMany).mockResolvedValue([
      {
        id: 'line-1',
        bomVersionId: 'bom-1',
        componentId: 'comp-1',
        quantityPerUnit: new Prisma.Decimal(2),
        notes: null,
        component: { costPerUnit: new Prisma.Decimal(10) },
      },
      {
        id: 'line-2',
        bomVersionId: 'bom-1',
        componentId: 'comp-2',
        quantityPerUnit: new Prisma.Decimal(3),
        notes: null,
        component: { costPerUnit: new Prisma.Decimal(5) },
      },
    ] as never)

    const result = await calculateBOMUnitCost('bom-1', TEST_COMPANY_ID)

    // (2 * 10) + (3 * 5) = 20 + 15 = 35
    expect(result).toBe(35)
  })

  it('returns 0 for BOM with no lines', async () => {
    vi.mocked(prisma.bOMLine.findMany).mockResolvedValue([])

    const result = await calculateBOMUnitCost('empty-bom', TEST_COMPANY_ID)
    expect(result).toBe(0)
  })

  it('handles decimal precision correctly', async () => {
    vi.mocked(prisma.bOMLine.findMany).mockResolvedValue([
      {
        id: 'line-1',
        bomVersionId: 'bom-1',
        componentId: 'comp-1',
        quantityPerUnit: new Prisma.Decimal(1.5),
        notes: null,
        component: { costPerUnit: new Prisma.Decimal(3.33) },
      },
    ] as never)

    const result = await calculateBOMUnitCost('bom-1', TEST_COMPANY_ID)

    // 1.5 * 3.33 = 4.995
    expect(result).toBeCloseTo(4.995, 3)
  })

  it('handles single component BOM', async () => {
    vi.mocked(prisma.bOMLine.findMany).mockResolvedValue([
      {
        id: 'line-1',
        bomVersionId: 'bom-1',
        componentId: 'comp-1',
        quantityPerUnit: new Prisma.Decimal(10),
        notes: null,
        component: { costPerUnit: new Prisma.Decimal(2.5) },
      },
    ] as never)

    const result = await calculateBOMUnitCost('bom-1', TEST_COMPANY_ID)
    expect(result).toBe(25)
  })

  it('handles many components', async () => {
    const lines = Array.from({ length: 10 }, (_, i) => ({
      id: `line-${i}`,
      bomVersionId: 'bom-1',
      componentId: `comp-${i}`,
      quantityPerUnit: new Prisma.Decimal(1),
      notes: null,
      component: { costPerUnit: new Prisma.Decimal(10) },
    }))

    vi.mocked(prisma.bOMLine.findMany).mockResolvedValue(lines as never)

    const result = await calculateBOMUnitCost('bom-1', TEST_COMPANY_ID)
    expect(result).toBe(100) // 10 components * 1 qty * $10 each = $100
  })
})

describe('calculateBOMUnitCosts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calculates costs for multiple BOMs', async () => {
    vi.mocked(prisma.bOMLine.findMany).mockResolvedValue([
      {
        id: 'line-1',
        bomVersionId: 'bom-1',
        componentId: 'comp-1',
        quantityPerUnit: new Prisma.Decimal(2),
        notes: null,
        component: { costPerUnit: new Prisma.Decimal(10) },
      },
      {
        id: 'line-2',
        bomVersionId: 'bom-2',
        componentId: 'comp-1',
        quantityPerUnit: new Prisma.Decimal(5),
        notes: null,
        component: { costPerUnit: new Prisma.Decimal(10) },
      },
    ] as never)

    const result = await calculateBOMUnitCosts(['bom-1', 'bom-2', 'bom-3'], TEST_COMPANY_ID)

    expect(result.get('bom-1')).toBe(20)
    expect(result.get('bom-2')).toBe(50)
    expect(result.get('bom-3')).toBe(0) // No lines, defaults to 0
  })

  it('handles empty BOM list', async () => {
    vi.mocked(prisma.bOMLine.findMany).mockResolvedValue([])

    const result = await calculateBOMUnitCosts([], TEST_COMPANY_ID)
    expect(result.size).toBe(0)
  })

  it('handles BOM with multiple lines summing correctly', async () => {
    vi.mocked(prisma.bOMLine.findMany).mockResolvedValue([
      {
        id: 'line-1',
        bomVersionId: 'bom-1',
        componentId: 'comp-1',
        quantityPerUnit: new Prisma.Decimal(2),
        notes: null,
        component: { costPerUnit: new Prisma.Decimal(10) },
      },
      {
        id: 'line-2',
        bomVersionId: 'bom-1',
        componentId: 'comp-2',
        quantityPerUnit: new Prisma.Decimal(3),
        notes: null,
        component: { costPerUnit: new Prisma.Decimal(5) },
      },
    ] as never)

    const result = await calculateBOMUnitCosts(['bom-1'], TEST_COMPANY_ID)
    expect(result.get('bom-1')).toBe(35) // 20 + 15
  })
})

describe('calculateMaxBuildableUnits', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when no active BOM exists', async () => {
    vi.mocked(prisma.bOMVersion.findFirst).mockResolvedValue(null)

    const result = await calculateMaxBuildableUnits('sku-no-bom', 'company-1')
    expect(result).toBeNull()
  })

  it('returns null when BOM has no lines', async () => {
    vi.mocked(prisma.bOMVersion.findFirst).mockResolvedValue({
      id: 'bom-1',
      skuId: 'sku-1',
      versionName: 'v1',
      isActive: true,
      lines: [],
    } as never)

    const result = await calculateMaxBuildableUnits('sku-empty-bom', 'company-1')
    expect(result).toBeNull()
  })

  it('calculates max buildable as minimum across components', async () => {
    vi.mocked(prisma.bOMVersion.findFirst).mockResolvedValue({
      id: 'bom-1',
      skuId: 'sku-1',
      versionName: 'v1',
      isActive: true,
      lines: [
        { componentId: 'comp-1', quantityPerUnit: new Prisma.Decimal(2), component: { id: 'comp-1' } },
        { componentId: 'comp-2', quantityPerUnit: new Prisma.Decimal(5), component: { id: 'comp-2' } },
      ],
    } as never)

    // Mock component ownership verification for getComponentQuantities
    vi.mocked(prisma.component.findMany).mockResolvedValue([
      { id: 'comp-1' },
      { id: 'comp-2' },
    ] as never)

    // comp-1: 100 on hand, needs 2 per unit -> can build 50
    // comp-2: 30 on hand, needs 5 per unit -> can build 6
    // Max buildable = min(50, 6) = 6
    vi.mocked(prisma.transactionLine.groupBy).mockResolvedValue([
      { componentId: 'comp-1', _sum: { quantityChange: new Prisma.Decimal(100) } },
      { componentId: 'comp-2', _sum: { quantityChange: new Prisma.Decimal(30) } },
    ] as never)

    const result = await calculateMaxBuildableUnits('sku-1', 'company-1')
    expect(result).toBe(6)
  })

  it('returns 0 when any component has zero inventory', async () => {
    vi.mocked(prisma.bOMVersion.findFirst).mockResolvedValue({
      id: 'bom-1',
      skuId: 'sku-1',
      versionName: 'v1',
      isActive: true,
      lines: [
        { componentId: 'comp-1', quantityPerUnit: new Prisma.Decimal(1), component: { id: 'comp-1' } },
      ],
    } as never)

    // Mock component ownership verification for getComponentQuantities
    vi.mocked(prisma.component.findMany).mockResolvedValue([
      { id: 'comp-1' },
    ] as never)

    vi.mocked(prisma.transactionLine.groupBy).mockResolvedValue([])

    const result = await calculateMaxBuildableUnits('sku-1', 'company-1')
    expect(result).toBe(0)
  })

  it('handles single component BOM', async () => {
    vi.mocked(prisma.bOMVersion.findFirst).mockResolvedValue({
      id: 'bom-1',
      skuId: 'sku-1',
      versionName: 'v1',
      isActive: true,
      lines: [
        { componentId: 'comp-1', quantityPerUnit: new Prisma.Decimal(4), component: { id: 'comp-1' } },
      ],
    } as never)

    // Mock component ownership verification for getComponentQuantities
    vi.mocked(prisma.component.findMany).mockResolvedValue([
      { id: 'comp-1' },
    ] as never)

    vi.mocked(prisma.transactionLine.groupBy).mockResolvedValue([
      { componentId: 'comp-1', _sum: { quantityChange: new Prisma.Decimal(50) } },
    ] as never)

    const result = await calculateMaxBuildableUnits('sku-1', 'company-1')
    expect(result).toBe(12) // 50 / 4 = 12 (floored)
  })

  it('floors decimal results', async () => {
    vi.mocked(prisma.bOMVersion.findFirst).mockResolvedValue({
      id: 'bom-1',
      skuId: 'sku-1',
      versionName: 'v1',
      isActive: true,
      lines: [
        { componentId: 'comp-1', quantityPerUnit: new Prisma.Decimal(3), component: { id: 'comp-1' } },
      ],
    } as never)

    // Mock component ownership verification for getComponentQuantities
    vi.mocked(prisma.component.findMany).mockResolvedValue([
      { id: 'comp-1' },
    ] as never)

    vi.mocked(prisma.transactionLine.groupBy).mockResolvedValue([
      { componentId: 'comp-1', _sum: { quantityChange: new Prisma.Decimal(10) } },
    ] as never)

    const result = await calculateMaxBuildableUnits('sku-1', 'company-1')
    expect(result).toBe(3) // 10 / 3 = 3.33, floored to 3
  })
})

describe('calculateLineCosts', () => {
  it('calculates line costs correctly', () => {
    const lines = [
      {
        quantityPerUnit: new Prisma.Decimal(2),
        component: { costPerUnit: new Prisma.Decimal(10) },
      },
      {
        quantityPerUnit: new Prisma.Decimal(3),
        component: { costPerUnit: new Prisma.Decimal(5.5) },
      },
    ]

    const result = calculateLineCosts(lines)

    expect(result[0].lineCost).toBe(20)
    expect(result[1].lineCost).toBeCloseTo(16.5, 2)
  })

  it('returns empty array for empty input', () => {
    const result = calculateLineCosts([])
    expect(result).toEqual([])
  })

  it('handles zero cost components', () => {
    const lines = [
      {
        quantityPerUnit: new Prisma.Decimal(5),
        component: { costPerUnit: new Prisma.Decimal(0) },
      },
    ]

    const result = calculateLineCosts(lines)
    expect(result[0].lineCost).toBe(0)
  })

  it('handles single line', () => {
    const lines = [
      {
        quantityPerUnit: new Prisma.Decimal(1),
        component: { costPerUnit: new Prisma.Decimal(99.99) },
      },
    ]

    const result = calculateLineCosts(lines)
    expect(result).toHaveLength(1)
    expect(result[0].lineCost).toBeCloseTo(99.99, 2)
  })

  it('handles decimal precision', () => {
    const lines = [
      {
        quantityPerUnit: new Prisma.Decimal(0.333),
        component: { costPerUnit: new Prisma.Decimal(3) },
      },
    ]

    const result = calculateLineCosts(lines)
    expect(result[0].lineCost).toBeCloseTo(0.999, 3)
  })
})
