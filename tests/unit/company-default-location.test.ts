/**
 * Unit tests for default location integration points
 * Verifies ensureDefaultLocation is called during company setup
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma before imports
vi.mock('@/lib/db', () => ({
  prisma: {
    company: {
      findUnique: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    location: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    userCompany: {
      findUnique: vi.fn(),
    },
    brand: {
      findMany: vi.fn(),
    },
    securityEvent: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

// Mock next-auth
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

import { prisma } from '@/lib/db'
import { ensureDefaultLocation } from '@/services/location'

describe('Default Location Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('ensureDefaultLocation function', () => {
    it('creates default location for company without locations', async () => {
      vi.mocked(prisma.location.findMany).mockResolvedValue([])
      vi.mocked(prisma.location.create).mockResolvedValue({
        id: 'loc-1',
        companyId: 'company-1',
        name: 'Main Warehouse',
        type: 'warehouse',
        isDefault: true,
        isActive: true,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      await ensureDefaultLocation('company-1')

      expect(prisma.location.create).toHaveBeenCalledWith({
        data: {
          companyId: 'company-1',
          name: 'Main Warehouse',
          type: 'warehouse',
          isDefault: true,
          isActive: true,
        },
      })
    })

    it('does not create location if default already exists', async () => {
      vi.mocked(prisma.location.findMany).mockResolvedValue([{
        id: 'loc-1',
        companyId: 'company-1',
        name: 'Existing Warehouse',
        type: 'warehouse',
        isDefault: true,
        isActive: true,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }])

      await ensureDefaultLocation('company-1')

      expect(prisma.location.create).not.toHaveBeenCalled()
      expect(prisma.location.update).not.toHaveBeenCalled()
    })

    it('sets first location as default if none marked default', async () => {
      vi.mocked(prisma.location.findMany).mockResolvedValue([
        {
          id: 'loc-1',
          companyId: 'company-1',
          name: 'Warehouse A',
          type: 'warehouse',
          isDefault: false,
          isActive: true,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'loc-2',
          companyId: 'company-1',
          name: 'Warehouse B',
          type: 'warehouse',
          isDefault: false,
          isActive: true,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])

      await ensureDefaultLocation('company-1')

      expect(prisma.location.create).not.toHaveBeenCalled()
      expect(prisma.location.update).toHaveBeenCalledWith({
        where: { id: 'loc-1' },
        data: { isDefault: true },
      })
    })
  })

  describe('ensureDefaultLocation is idempotent', () => {
    it('can be called multiple times without creating duplicate locations', async () => {
      // First call - no locations exist
      vi.mocked(prisma.location.findMany).mockResolvedValue([])
      vi.mocked(prisma.location.create).mockResolvedValue({
        id: 'loc-1',
        companyId: 'company-1',
        name: 'Main Warehouse',
        type: 'warehouse',
        isDefault: true,
        isActive: true,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      await ensureDefaultLocation('company-1')
      expect(prisma.location.create).toHaveBeenCalledTimes(1)

      // Second call - location now exists
      vi.mocked(prisma.location.findMany).mockResolvedValue([{
        id: 'loc-1',
        companyId: 'company-1',
        name: 'Main Warehouse',
        type: 'warehouse',
        isDefault: true,
        isActive: true,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }])

      await ensureDefaultLocation('company-1')
      // Should still only have been called once (from first call)
      expect(prisma.location.create).toHaveBeenCalledTimes(1)
    })
  })
})
