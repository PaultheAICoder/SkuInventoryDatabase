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
  },
}))

import { canDeleteComponent } from '@/services/inventory'
import { prisma } from '@/lib/db'

describe('canDeleteComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns true when component is not used in any active BOM', async () => {
    vi.mocked(prisma.bOMLine.count).mockResolvedValue(0)

    const result = await canDeleteComponent('unused-comp')

    expect(result).toBe(true)
    expect(prisma.bOMLine.count).toHaveBeenCalledWith({
      where: {
        componentId: 'unused-comp',
        bomVersion: {
          isActive: true,
        },
      },
    })
  })

  it('returns false when component is used in active BOMs', async () => {
    vi.mocked(prisma.bOMLine.count).mockResolvedValue(3)

    const result = await canDeleteComponent('used-comp')

    expect(result).toBe(false)
  })

  it('returns true when component is only in inactive BOMs', async () => {
    // The count query filters by isActive: true, so inactive BOMs are not counted
    vi.mocked(prisma.bOMLine.count).mockResolvedValue(0)

    const result = await canDeleteComponent('inactive-bom-comp')

    expect(result).toBe(true)
  })

  it('returns false when component is used in exactly one active BOM', async () => {
    vi.mocked(prisma.bOMLine.count).mockResolvedValue(1)

    const result = await canDeleteComponent('used-in-one')

    expect(result).toBe(false)
  })

  it('returns false when component is used in many active BOMs', async () => {
    vi.mocked(prisma.bOMLine.count).mockResolvedValue(100)

    const result = await canDeleteComponent('heavily-used')

    expect(result).toBe(false)
  })
})
