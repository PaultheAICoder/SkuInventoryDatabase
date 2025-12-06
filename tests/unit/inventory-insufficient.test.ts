/**
 * Unit tests for checkInsufficientInventory function
 * Tests the inventory sufficiency check for BOM builds
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

vi.mock('@/lib/db', () => ({
  prisma: {
    bOMLine: {
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

import { checkInsufficientInventory } from '@/services/inventory'
import { prisma } from '@/lib/db'

describe('checkInsufficientInventory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: all requested components exist and belong to company
    vi.mocked(prisma.component.findMany).mockImplementation(((args: { where?: { id?: { in: string[] } } }) => {
      const ids = args?.where?.id?.in ?? []
      return Promise.resolve(ids.map(id => ({ id })))
    }) as never)
  })

  it('returns empty array when sufficient inventory exists', async () => {
    // BOM requires 2 units per build
    vi.mocked(prisma.bOMLine.findMany).mockResolvedValue([
      {
        id: 'line-1',
        bomVersionId: 'bom-1',
        componentId: 'comp-1',
        quantityPerUnit: new Prisma.Decimal(2),
        notes: null,
        component: { id: 'comp-1', name: 'Widget', skuCode: 'W-001' },
      },
    ] as never)

    // 100 units on hand, building 10 requires 20 -> sufficient
    vi.mocked(prisma.transactionLine.groupBy).mockResolvedValue([
      { componentId: 'comp-1', _sum: { quantityChange: new Prisma.Decimal(100) } },
    ] as never)

    const result = await checkInsufficientInventory({
      bomVersionId: 'bom-1',
      companyId: 'company-1',
      unitsToBuild: 10,
    })

    expect(result).toEqual([])
  })

  it('returns insufficient items when inventory is short', async () => {
    vi.mocked(prisma.bOMLine.findMany).mockResolvedValue([
      {
        id: 'line-1',
        bomVersionId: 'bom-1',
        componentId: 'comp-1',
        quantityPerUnit: new Prisma.Decimal(5),
        notes: null,
        component: { id: 'comp-1', name: 'Widget', skuCode: 'W-001' },
      },
    ] as never)

    // Only 20 units on hand, building 10 requires 50 -> shortage of 30
    vi.mocked(prisma.transactionLine.groupBy).mockResolvedValue([
      { componentId: 'comp-1', _sum: { quantityChange: new Prisma.Decimal(20) } },
    ] as never)

    const result = await checkInsufficientInventory({
      bomVersionId: 'bom-1',
      companyId: 'company-1',
      unitsToBuild: 10,
    })

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      componentId: 'comp-1',
      componentName: 'Widget',
      required: 50,
      available: 20,
      shortage: 30,
    })
  })

  it('returns empty array for BOM with no lines', async () => {
    vi.mocked(prisma.bOMLine.findMany).mockResolvedValue([])

    const result = await checkInsufficientInventory({
      bomVersionId: 'empty-bom',
      companyId: 'company-1',
      unitsToBuild: 10,
    })

    expect(result).toEqual([])
  })

  it('handles multiple components with mixed availability', async () => {
    vi.mocked(prisma.bOMLine.findMany).mockResolvedValue([
      {
        id: 'line-1',
        bomVersionId: 'bom-1',
        componentId: 'comp-1',
        quantityPerUnit: new Prisma.Decimal(2),
        notes: null,
        component: { id: 'comp-1', name: 'Widget A', skuCode: 'W-001' },
      },
      {
        id: 'line-2',
        bomVersionId: 'bom-1',
        componentId: 'comp-2',
        quantityPerUnit: new Prisma.Decimal(3),
        notes: null,
        component: { id: 'comp-2', name: 'Widget B', skuCode: 'W-002' },
      },
    ] as never)

    // comp-1: sufficient (100 on hand, need 20)
    // comp-2: insufficient (10 on hand, need 30)
    vi.mocked(prisma.transactionLine.groupBy).mockResolvedValue([
      { componentId: 'comp-1', _sum: { quantityChange: new Prisma.Decimal(100) } },
      { componentId: 'comp-2', _sum: { quantityChange: new Prisma.Decimal(10) } },
    ] as never)

    const result = await checkInsufficientInventory({
      bomVersionId: 'bom-1',
      companyId: 'company-1',
      unitsToBuild: 10,
    })

    expect(result).toHaveLength(1)
    expect(result[0].componentId).toBe('comp-2')
    expect(result[0].shortage).toBe(20)
  })

  it('handles all components being insufficient', async () => {
    vi.mocked(prisma.bOMLine.findMany).mockResolvedValue([
      {
        id: 'line-1',
        bomVersionId: 'bom-1',
        componentId: 'comp-1',
        quantityPerUnit: new Prisma.Decimal(10),
        notes: null,
        component: { id: 'comp-1', name: 'Widget A', skuCode: 'W-001' },
      },
      {
        id: 'line-2',
        bomVersionId: 'bom-1',
        componentId: 'comp-2',
        quantityPerUnit: new Prisma.Decimal(20),
        notes: null,
        component: { id: 'comp-2', name: 'Widget B', skuCode: 'W-002' },
      },
    ] as never)

    // Both insufficient
    vi.mocked(prisma.transactionLine.groupBy).mockResolvedValue([
      { componentId: 'comp-1', _sum: { quantityChange: new Prisma.Decimal(5) } },
      { componentId: 'comp-2', _sum: { quantityChange: new Prisma.Decimal(10) } },
    ] as never)

    const result = await checkInsufficientInventory({
      bomVersionId: 'bom-1',
      companyId: 'company-1',
      unitsToBuild: 5,
    })

    expect(result).toHaveLength(2)
    expect(result.find((r) => r.componentId === 'comp-1')?.shortage).toBe(45) // need 50, have 5
    expect(result.find((r) => r.componentId === 'comp-2')?.shortage).toBe(90) // need 100, have 10
  })

  it('handles zero inventory for a component', async () => {
    vi.mocked(prisma.bOMLine.findMany).mockResolvedValue([
      {
        id: 'line-1',
        bomVersionId: 'bom-1',
        componentId: 'comp-1',
        quantityPerUnit: new Prisma.Decimal(2),
        notes: null,
        component: { id: 'comp-1', name: 'Widget', skuCode: 'W-001' },
      },
    ] as never)

    // No inventory at all
    vi.mocked(prisma.transactionLine.groupBy).mockResolvedValue([])

    const result = await checkInsufficientInventory({
      bomVersionId: 'bom-1',
      companyId: 'company-1',
      unitsToBuild: 5,
    })

    expect(result).toHaveLength(1)
    expect(result[0].available).toBe(0)
    expect(result[0].required).toBe(10)
    expect(result[0].shortage).toBe(10)
  })

  it('handles building a single unit', async () => {
    vi.mocked(prisma.bOMLine.findMany).mockResolvedValue([
      {
        id: 'line-1',
        bomVersionId: 'bom-1',
        componentId: 'comp-1',
        quantityPerUnit: new Prisma.Decimal(3),
        notes: null,
        component: { id: 'comp-1', name: 'Widget', skuCode: 'W-001' },
      },
    ] as never)

    vi.mocked(prisma.transactionLine.groupBy).mockResolvedValue([
      { componentId: 'comp-1', _sum: { quantityChange: new Prisma.Decimal(2) } },
    ] as never)

    const result = await checkInsufficientInventory({
      bomVersionId: 'bom-1',
      companyId: 'company-1',
      unitsToBuild: 1,
    })

    expect(result).toHaveLength(1)
    expect(result[0].required).toBe(3)
    expect(result[0].available).toBe(2)
    expect(result[0].shortage).toBe(1)
  })

  it('handles decimal quantities per unit', async () => {
    vi.mocked(prisma.bOMLine.findMany).mockResolvedValue([
      {
        id: 'line-1',
        bomVersionId: 'bom-1',
        componentId: 'comp-1',
        quantityPerUnit: new Prisma.Decimal(1.5),
        notes: null,
        component: { id: 'comp-1', name: 'Widget', skuCode: 'W-001' },
      },
    ] as never)

    vi.mocked(prisma.transactionLine.groupBy).mockResolvedValue([
      { componentId: 'comp-1', _sum: { quantityChange: new Prisma.Decimal(10) } },
    ] as never)

    const result = await checkInsufficientInventory({
      bomVersionId: 'bom-1',
      companyId: 'company-1',
      unitsToBuild: 10,
    })

    expect(result).toHaveLength(1)
    expect(result[0].required).toBe(15)
    expect(result[0].available).toBe(10)
    expect(result[0].shortage).toBe(5)
  })
})
