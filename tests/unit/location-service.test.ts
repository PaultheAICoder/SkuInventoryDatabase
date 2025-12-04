/**
 * Unit tests for location service functions
 * Tests location management operations with mocked Prisma
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma before imports
vi.mock('@/lib/db', () => ({
  prisma: {
    location: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

import {
  ensureDefaultLocation,
  setDefaultLocation,
  canDeactivateLocation,
  canDeleteLocation,
  getDefaultLocation,
  getDefaultLocationId,
} from '@/services/location'
import { prisma } from '@/lib/db'

describe('Location Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('ensureDefaultLocation', () => {
    it('creates default warehouse when no locations exist', async () => {
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

      expect(prisma.location.findMany).toHaveBeenCalledWith({
        where: { companyId: 'company-1' },
        orderBy: { createdAt: 'asc' },
      })
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

    it('makes first location default when none is marked default', async () => {
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

      expect(prisma.location.update).toHaveBeenCalledWith({
        where: { id: 'loc-1' },
        data: { isDefault: true },
      })
    })

    it('does nothing when default location already exists', async () => {
      vi.mocked(prisma.location.findMany).mockResolvedValue([
        {
          id: 'loc-1',
          companyId: 'company-1',
          name: 'Default Warehouse',
          type: 'warehouse',
          isDefault: true,
          isActive: true,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])

      await ensureDefaultLocation('company-1')

      expect(prisma.location.create).not.toHaveBeenCalled()
      expect(prisma.location.update).not.toHaveBeenCalled()
    })
  })

  describe('setDefaultLocation', () => {
    it('unsets existing defaults before setting new one', async () => {
      vi.mocked(prisma.$transaction).mockImplementation(async (queries) => {
        // Simulate transaction execution
        return queries
      })

      await setDefaultLocation('company-1', 'loc-2')

      // Verify $transaction was called with an array (the batch queries)
      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
      const callArgs = vi.mocked(prisma.$transaction).mock.calls[0][0]
      expect(Array.isArray(callArgs)).toBe(true)
      expect(callArgs).toHaveLength(2) // updateMany + update
    })
  })

  describe('canDeactivateLocation', () => {
    it('returns false with reason for default location', async () => {
      vi.mocked(prisma.location.findUnique).mockResolvedValue({
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

      const result = await canDeactivateLocation('company-1', 'loc-1')

      expect(result.canDeactivate).toBe(false)
      expect(result.reason).toBe('Cannot deactivate the default location')
    })

    it('returns true for non-default location', async () => {
      vi.mocked(prisma.location.findUnique).mockResolvedValue({
        id: 'loc-2',
        companyId: 'company-1',
        name: 'Secondary Warehouse',
        type: 'warehouse',
        isDefault: false,
        isActive: true,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const result = await canDeactivateLocation('company-1', 'loc-2')

      expect(result.canDeactivate).toBe(true)
      expect(result.reason).toBeUndefined()
    })

    it('returns true when location not found', async () => {
      vi.mocked(prisma.location.findUnique).mockResolvedValue(null)

      const result = await canDeactivateLocation('company-1', 'loc-missing')

      expect(result.canDeactivate).toBe(true)
    })
  })

  describe('canDeleteLocation', () => {
    it('returns false with reason for default location', async () => {
      vi.mocked(prisma.location.findUnique).mockResolvedValue({
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

      const result = await canDeleteLocation('loc-1')

      expect(result.canDelete).toBe(false)
      expect(result.reason).toBe('Cannot delete the default location')
    })

    it('returns true for non-default location', async () => {
      vi.mocked(prisma.location.findUnique).mockResolvedValue({
        id: 'loc-2',
        companyId: 'company-1',
        name: 'Secondary Warehouse',
        type: 'warehouse',
        isDefault: false,
        isActive: true,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const result = await canDeleteLocation('loc-2')

      expect(result.canDelete).toBe(true)
      expect(result.reason).toBeUndefined()
    })

    it('returns true when location not found', async () => {
      vi.mocked(prisma.location.findUnique).mockResolvedValue(null)

      const result = await canDeleteLocation('loc-missing')

      expect(result.canDelete).toBe(true)
    })
  })

  describe('getDefaultLocation', () => {
    it('returns the default active location', async () => {
      const defaultLocation = {
        id: 'loc-1',
        companyId: 'company-1',
        name: 'Main Warehouse',
        type: 'warehouse' as const,
        isDefault: true,
        isActive: true,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      vi.mocked(prisma.location.findFirst).mockResolvedValue(defaultLocation)

      const result = await getDefaultLocation('company-1')

      expect(result).toEqual(defaultLocation)
      expect(prisma.location.findFirst).toHaveBeenCalledWith({
        where: {
          companyId: 'company-1',
          isDefault: true,
          isActive: true,
        },
      })
    })

    it('returns null when no default exists', async () => {
      vi.mocked(prisma.location.findFirst).mockResolvedValue(null)

      const result = await getDefaultLocation('company-1')

      expect(result).toBeNull()
    })
  })

  describe('getDefaultLocationId', () => {
    it('returns id of default location', async () => {
      vi.mocked(prisma.location.findFirst).mockResolvedValue({
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

      const result = await getDefaultLocationId('company-1')

      expect(result).toBe('loc-1')
    })

    it('returns null when no default exists', async () => {
      vi.mocked(prisma.location.findFirst).mockResolvedValue(null)

      const result = await getDefaultLocationId('company-1')

      expect(result).toBeNull()
    })
  })
})
