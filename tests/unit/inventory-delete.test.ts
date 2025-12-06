/**
 * Unit tests for canDeleteComponent function
 * Tests whether a component can be safely deleted
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    bOMLine: {
      count: vi.fn(),
    },
    transactionLine: {
      count: vi.fn(),
    },
    lot: {
      count: vi.fn(),
    },
  },
}))

import { canDeleteComponent } from '@/services/inventory'
import { prisma } from '@/lib/db'

describe('canDeleteComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns canDelete: true when component has no references', async () => {
    vi.mocked(prisma.transactionLine.count).mockResolvedValue(0)
    vi.mocked(prisma.bOMLine.count).mockResolvedValue(0)
    vi.mocked(prisma.lot.count).mockResolvedValue(0)

    const result = await canDeleteComponent('unused-comp')

    expect(result.canDelete).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('returns canDelete: false when component has transaction history', async () => {
    vi.mocked(prisma.transactionLine.count).mockResolvedValue(5)
    vi.mocked(prisma.bOMLine.count).mockResolvedValue(0)
    vi.mocked(prisma.lot.count).mockResolvedValue(0)

    const result = await canDeleteComponent('used-in-transactions')

    expect(result.canDelete).toBe(false)
    expect(result.reason).toContain('5 transaction record(s)')
    expect(result.reason).toContain('Historical data must be preserved')
  })

  it('returns canDelete: false when component is used in any BOM (active or inactive)', async () => {
    vi.mocked(prisma.transactionLine.count).mockResolvedValue(0)
    vi.mocked(prisma.bOMLine.count).mockResolvedValue(2)
    vi.mocked(prisma.lot.count).mockResolvedValue(0)

    const result = await canDeleteComponent('in-any-bom')

    expect(result.canDelete).toBe(false)
    expect(result.reason).toContain('2 BOM(s)')
    expect(result.reason).toContain('Remove from all BOMs first')
  })

  it('returns canDelete: false when component has lots', async () => {
    vi.mocked(prisma.transactionLine.count).mockResolvedValue(0)
    vi.mocked(prisma.bOMLine.count).mockResolvedValue(0)
    vi.mocked(prisma.lot.count).mockResolvedValue(3)

    const result = await canDeleteComponent('has-lots')

    expect(result.canDelete).toBe(false)
    expect(result.reason).toContain('3 lot(s)')
    expect(result.reason).toContain('Delete lots first')
  })

  it('checks transaction lines first (priority order)', async () => {
    // Even with BOM and lot references, transaction lines are checked first
    vi.mocked(prisma.transactionLine.count).mockResolvedValue(10)
    vi.mocked(prisma.bOMLine.count).mockResolvedValue(5)
    vi.mocked(prisma.lot.count).mockResolvedValue(3)

    const result = await canDeleteComponent('multi-reference')

    expect(result.canDelete).toBe(false)
    expect(result.reason).toContain('10 transaction record(s)')
    // Should not have checked BOM or lot since transaction check fails first
    expect(prisma.bOMLine.count).not.toHaveBeenCalled()
    expect(prisma.lot.count).not.toHaveBeenCalled()
  })

  it('checks BOM lines second when no transaction references', async () => {
    vi.mocked(prisma.transactionLine.count).mockResolvedValue(0)
    vi.mocked(prisma.bOMLine.count).mockResolvedValue(7)
    vi.mocked(prisma.lot.count).mockResolvedValue(4)

    const result = await canDeleteComponent('bom-reference')

    expect(result.canDelete).toBe(false)
    expect(result.reason).toContain('7 BOM(s)')
    // Should have checked transactions, then BOM, but not lot
    expect(prisma.transactionLine.count).toHaveBeenCalled()
    expect(prisma.bOMLine.count).toHaveBeenCalled()
    expect(prisma.lot.count).not.toHaveBeenCalled()
  })

  it('checks lots third when no transaction or BOM references', async () => {
    vi.mocked(prisma.transactionLine.count).mockResolvedValue(0)
    vi.mocked(prisma.bOMLine.count).mockResolvedValue(0)
    vi.mocked(prisma.lot.count).mockResolvedValue(1)

    const result = await canDeleteComponent('lot-reference')

    expect(result.canDelete).toBe(false)
    expect(result.reason).toContain('1 lot(s)')
    // All three checks should have been made
    expect(prisma.transactionLine.count).toHaveBeenCalled()
    expect(prisma.bOMLine.count).toHaveBeenCalled()
    expect(prisma.lot.count).toHaveBeenCalled()
  })

  it('returns canDelete: false when component is used in exactly one BOM', async () => {
    vi.mocked(prisma.transactionLine.count).mockResolvedValue(0)
    vi.mocked(prisma.bOMLine.count).mockResolvedValue(1)
    vi.mocked(prisma.lot.count).mockResolvedValue(0)

    const result = await canDeleteComponent('used-in-one')

    expect(result.canDelete).toBe(false)
    expect(result.reason).toContain('1 BOM(s)')
  })

  it('returns canDelete: false when component is used in many BOMs', async () => {
    vi.mocked(prisma.transactionLine.count).mockResolvedValue(0)
    vi.mocked(prisma.bOMLine.count).mockResolvedValue(100)
    vi.mocked(prisma.lot.count).mockResolvedValue(0)

    const result = await canDeleteComponent('heavily-used')

    expect(result.canDelete).toBe(false)
    expect(result.reason).toContain('100 BOM(s)')
  })
})
