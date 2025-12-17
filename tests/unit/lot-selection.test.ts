import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    lot: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    component: {
      findFirst: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/db'
import {
  getAvailableLotsForComponent,
  selectLotsForConsumption,
  checkLotAvailabilityForBuild,
  validateLotOverrides,
} from '@/services/lot-selection'

const mockLotFindMany = vi.mocked(prisma.lot.findMany)
const mockLotFindFirst = vi.mocked(prisma.lot.findFirst)
const mockComponentFindFirst = vi.mocked(prisma.component.findFirst)

describe('lot-selection service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getAvailableLotsForComponent', () => {
    it('returns lots ordered by expiry date (FEFO)', async () => {
      const componentId = 'component-123'
      const mockLots = [
        {
          id: 'lot-1',
          componentId,
          lotNumber: 'LOT-001',
          expiryDate: new Date('2025-03-01'),
          receivedQuantity: { toNumber: () => 100 },
          supplier: 'Supplier A',
          notes: null,
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
          balance: { id: 'b1', lotId: 'lot-1', quantity: { toNumber: () => 50 }, reservedQuantity: { toNumber: () => 0 } },
        },
        {
          id: 'lot-2',
          componentId,
          lotNumber: 'LOT-002',
          expiryDate: new Date('2025-01-15'), // Earlier expiry - should come first
          receivedQuantity: { toNumber: () => 100 },
          supplier: 'Supplier B',
          notes: null,
          createdAt: new Date('2025-01-02'),
          updatedAt: new Date('2025-01-02'),
          balance: { id: 'b2', lotId: 'lot-2', quantity: { toNumber: () => 30 }, reservedQuantity: { toNumber: () => 0 } },
        },
      ]

      mockLotFindMany.mockResolvedValue(mockLots as never)

      const result = await getAvailableLotsForComponent(componentId)

      expect(result).toHaveLength(2)
      // FEFO order: earliest expiry first
      expect(result[0].lotNumber).toBe('LOT-002') // Jan 15
      expect(result[1].lotNumber).toBe('LOT-001') // Mar 1
    })

    it('sorts lots without expiry dates to end', async () => {
      const componentId = 'component-123'
      const mockLots = [
        {
          id: 'lot-1',
          componentId,
          lotNumber: 'LOT-NO-EXPIRY',
          expiryDate: null, // No expiry - should come last
          receivedQuantity: { toNumber: () => 100 },
          supplier: 'Supplier A',
          notes: null,
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
          balance: { id: 'b1', lotId: 'lot-1', quantity: { toNumber: () => 50 }, reservedQuantity: { toNumber: () => 0 } },
        },
        {
          id: 'lot-2',
          componentId,
          lotNumber: 'LOT-WITH-EXPIRY',
          expiryDate: new Date('2025-06-01'),
          receivedQuantity: { toNumber: () => 100 },
          supplier: 'Supplier B',
          notes: null,
          createdAt: new Date('2025-01-02'),
          updatedAt: new Date('2025-01-02'),
          balance: { id: 'b2', lotId: 'lot-2', quantity: { toNumber: () => 30 }, reservedQuantity: { toNumber: () => 0 } },
        },
      ]

      mockLotFindMany.mockResolvedValue(mockLots as never)

      const result = await getAvailableLotsForComponent(componentId)

      expect(result).toHaveLength(2)
      // Lots with expiry dates come first
      expect(result[0].lotNumber).toBe('LOT-WITH-EXPIRY')
      expect(result[1].lotNumber).toBe('LOT-NO-EXPIRY')
    })

    it('excludes lots with zero balance', async () => {
      // The Prisma query filters by balance > 0, so we mock returning an empty array
      mockLotFindMany.mockResolvedValue([])

      const result = await getAvailableLotsForComponent('component-123')

      expect(result).toHaveLength(0)
      expect(mockLotFindMany).toHaveBeenCalledWith({
        where: {
          componentId: 'component-123',
          balance: {
            quantity: { gt: 0 },
          },
        },
        include: {
          balance: true,
        },
        orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
      })
    })

    it('returns empty array when no lots available', async () => {
      mockLotFindMany.mockResolvedValue([])

      const result = await getAvailableLotsForComponent('component-no-lots')

      expect(result).toEqual([])
    })
  })

  describe('selectLotsForConsumption', () => {
    it('selects lots using FEFO until quantity met', async () => {
      const componentId = 'component-123'
      const mockLots = [
        {
          id: 'lot-1',
          componentId,
          lotNumber: 'LOT-EARLIEST',
          expiryDate: new Date('2025-01-15'),
          receivedQuantity: { toNumber: () => 100 },
          supplier: 'Supplier',
          notes: null,
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
          balance: { id: 'b1', lotId: 'lot-1', quantity: { toNumber: () => 30 }, reservedQuantity: { toNumber: () => 0 } },
        },
        {
          id: 'lot-2',
          componentId,
          lotNumber: 'LOT-LATER',
          expiryDate: new Date('2025-03-01'),
          receivedQuantity: { toNumber: () => 100 },
          supplier: 'Supplier',
          notes: null,
          createdAt: new Date('2025-01-02'),
          updatedAt: new Date('2025-01-02'),
          balance: { id: 'b2', lotId: 'lot-2', quantity: { toNumber: () => 50 }, reservedQuantity: { toNumber: () => 0 } },
        },
      ]

      mockLotFindMany.mockResolvedValue(mockLots as never)

      // Request 40 units - should use all of lot-1 (30) and 10 from lot-2
      const result = await selectLotsForConsumption({
        componentId,
        requiredQuantity: 40,
      })

      expect(result).toHaveLength(2)
      expect(result[0].lotId).toBe('lot-1')
      expect(result[0].quantity).toBe(30)
      expect(result[1].lotId).toBe('lot-2')
      expect(result[1].quantity).toBe(10)
    })

    it('throws error when insufficient and not allowed', async () => {
      const componentId = 'component-123'
      const mockLots = [
        {
          id: 'lot-1',
          componentId,
          lotNumber: 'LOT-001',
          expiryDate: new Date('2025-03-01'),
          receivedQuantity: { toNumber: () => 100 },
          supplier: 'Supplier',
          notes: null,
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
          balance: { id: 'b1', lotId: 'lot-1', quantity: { toNumber: () => 20 }, reservedQuantity: { toNumber: () => 0 } },
        },
      ]

      mockLotFindMany.mockResolvedValue(mockLots as never)

      // Request 50 units but only 20 available
      await expect(
        selectLotsForConsumption({
          componentId,
          requiredQuantity: 50,
        })
      ).rejects.toThrow('Insufficient lot quantity')
    })

    it('returns partial selection when allowInsufficient is true', async () => {
      const componentId = 'component-123'
      const mockLots = [
        {
          id: 'lot-1',
          componentId,
          lotNumber: 'LOT-001',
          expiryDate: new Date('2025-03-01'),
          receivedQuantity: { toNumber: () => 100 },
          supplier: 'Supplier',
          notes: null,
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
          balance: { id: 'b1', lotId: 'lot-1', quantity: { toNumber: () => 20 }, reservedQuantity: { toNumber: () => 0 } },
        },
      ]

      mockLotFindMany.mockResolvedValue(mockLots as never)

      // Request 50 units but only 20 available - should return partial
      const result = await selectLotsForConsumption({
        componentId,
        requiredQuantity: 50,
        allowInsufficient: true,
      })

      expect(result).toHaveLength(1)
      expect(result[0].quantity).toBe(20)
    })

    it('returns empty array when no lots available and allowInsufficient is true', async () => {
      mockLotFindMany.mockResolvedValue([])

      const result = await selectLotsForConsumption({
        componentId: 'component-123',
        requiredQuantity: 10,
        allowInsufficient: true,
      })

      expect(result).toEqual([])
    })
  })

  describe('checkLotAvailabilityForBuild', () => {
    it('identifies components with lots vs pooled', async () => {
      const bomLines = [
        {
          componentId: 'comp-with-lots',
          componentName: 'Component With Lots',
          skuCode: 'COMP-001',
          quantityRequired: 10,
        },
        {
          componentId: 'comp-without-lots',
          componentName: 'Pooled Component',
          skuCode: 'COMP-002',
          quantityRequired: 5,
        },
      ]

      // First call returns lots for comp-with-lots
      mockLotFindMany
        .mockResolvedValueOnce([
          {
            id: 'lot-1',
            componentId: 'comp-with-lots',
            lotNumber: 'LOT-001',
            expiryDate: new Date('2025-06-01'),
            receivedQuantity: { toNumber: () => 100 },
            supplier: 'Supplier',
            notes: null,
            createdAt: new Date('2025-01-01'),
            updatedAt: new Date('2025-01-01'),
            balance: { id: 'b1', lotId: 'lot-1', quantity: { toNumber: () => 50 }, reservedQuantity: { toNumber: () => 0 } },
          },
        ] as never)
        // Second call returns empty for comp-without-lots (pooled)
        .mockResolvedValueOnce([])

      const results = await checkLotAvailabilityForBuild({ bomLines })

      expect(results).toHaveLength(2)

      // First component has lots
      expect(results[0].hasLots).toBe(true)
      expect(results[0].isPooled).toBe(false)
      expect(results[0].selectedLots).toHaveLength(1)
      expect(results[0].isSufficient).toBe(true)

      // Second component is pooled
      expect(results[1].hasLots).toBe(false)
      expect(results[1].isPooled).toBe(true)
      expect(results[1].selectedLots).toHaveLength(0)
    })

    it('calculates correct availability per component', async () => {
      const bomLines = [
        {
          componentId: 'comp-123',
          componentName: 'Test Component',
          skuCode: 'TEST-001',
          quantityRequired: 100,
        },
      ]

      mockLotFindMany.mockResolvedValue([
        {
          id: 'lot-1',
          componentId: 'comp-123',
          lotNumber: 'LOT-001',
          expiryDate: new Date('2025-03-01'),
          receivedQuantity: { toNumber: () => 50 },
          supplier: 'Supplier',
          notes: null,
          createdAt: new Date('2025-01-01'),
          updatedAt: new Date('2025-01-01'),
          balance: { id: 'b1', lotId: 'lot-1', quantity: { toNumber: () => 30 }, reservedQuantity: { toNumber: () => 0 } },
        },
        {
          id: 'lot-2',
          componentId: 'comp-123',
          lotNumber: 'LOT-002',
          expiryDate: new Date('2025-06-01'),
          receivedQuantity: { toNumber: () => 60 },
          supplier: 'Supplier',
          notes: null,
          createdAt: new Date('2025-01-02'),
          updatedAt: new Date('2025-01-02'),
          balance: { id: 'b2', lotId: 'lot-2', quantity: { toNumber: () => 40 }, reservedQuantity: { toNumber: () => 0 } },
        },
      ] as never)

      const results = await checkLotAvailabilityForBuild({ bomLines })

      expect(results[0].availableQuantity).toBe(70) // 30 + 40
      expect(results[0].requiredQuantity).toBe(100)
      expect(results[0].isSufficient).toBe(false) // 70 < 100
    })
  })

  describe('validateLotOverrides', () => {
    const testCompanyId = 'company-abc'

    it('validates lot exists and belongs to component', async () => {
      const overrides = [
        {
          componentId: 'comp-123',
          allocations: [{ lotId: 'lot-wrong', quantity: 10 }],
        },
      ]

      // Component exists in the company
      mockComponentFindFirst.mockResolvedValue({ id: 'comp-123' } as never)

      // Lot exists but belongs to different component
      mockLotFindFirst.mockResolvedValue({
        id: 'lot-wrong',
        componentId: 'comp-456', // Different component!
        lotNumber: 'LOT-WRONG',
        expiryDate: null,
        receivedQuantity: { toNumber: () => 100 },
        supplier: 'Supplier',
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        balance: { id: 'b1', lotId: 'lot-wrong', quantity: { toNumber: () => 50 }, reservedQuantity: { toNumber: () => 0 } },
      } as never)

      const result = await validateLotOverrides(overrides, testCompanyId)

      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('does not belong to')
    })

    it('returns errors for insufficient lot quantity', async () => {
      const overrides = [
        {
          componentId: 'comp-123',
          allocations: [{ lotId: 'lot-1', quantity: 100 }],
        },
      ]

      // Component exists in the company
      mockComponentFindFirst.mockResolvedValue({ id: 'comp-123' } as never)

      mockLotFindFirst.mockResolvedValue({
        id: 'lot-1',
        componentId: 'comp-123',
        lotNumber: 'LOT-001',
        expiryDate: null,
        receivedQuantity: { toNumber: () => 50 },
        supplier: 'Supplier',
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        balance: { id: 'b1', lotId: 'lot-1', quantity: { toNumber: () => 20 }, reservedQuantity: { toNumber: () => 0 } }, // Only 20 available
      } as never)

      const result = await validateLotOverrides(overrides, testCompanyId)

      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('requested 100, available 20')
    })

    it('returns valid when all allocations are correct', async () => {
      const overrides = [
        {
          componentId: 'comp-123',
          allocations: [{ lotId: 'lot-1', quantity: 10 }],
        },
      ]

      // Component exists in the company
      mockComponentFindFirst.mockResolvedValue({ id: 'comp-123' } as never)

      mockLotFindFirst.mockResolvedValue({
        id: 'lot-1',
        componentId: 'comp-123',
        lotNumber: 'LOT-001',
        expiryDate: null,
        receivedQuantity: { toNumber: () => 50 },
        supplier: 'Supplier',
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        balance: { id: 'b1', lotId: 'lot-1', quantity: { toNumber: () => 50 }, reservedQuantity: { toNumber: () => 0 } },
      } as never)

      const result = await validateLotOverrides(overrides, testCompanyId)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('returns error when lot not found', async () => {
      const overrides = [
        {
          componentId: 'comp-123',
          allocations: [{ lotId: 'non-existent-lot', quantity: 10 }],
        },
      ]

      // Component exists in the company
      mockComponentFindFirst.mockResolvedValue({ id: 'comp-123' } as never)

      // Lot not found (or belongs to different company - same result)
      mockLotFindFirst.mockResolvedValue(null)

      const result = await validateLotOverrides(overrides, testCompanyId)

      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('not found or access denied')
    })

    it('rejects component from different company', async () => {
      const overrides = [
        {
          componentId: 'comp-from-other-company',
          allocations: [{ lotId: 'lot-1', quantity: 10 }],
        },
      ]

      // Component not found in the company (belongs to different company)
      mockComponentFindFirst.mockResolvedValue(null)

      const result = await validateLotOverrides(overrides, testCompanyId)

      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('Component')
      expect(result.errors[0]).toContain('not found or access denied')
    })

    it('rejects lot from different company', async () => {
      const overrides = [
        {
          componentId: 'comp-123',
          allocations: [{ lotId: 'lot-from-other-company', quantity: 10 }],
        },
      ]

      // Component exists in the company
      mockComponentFindFirst.mockResolvedValue({ id: 'comp-123' } as never)

      // Lot not found because it belongs to different company
      mockLotFindFirst.mockResolvedValue(null)

      const result = await validateLotOverrides(overrides, testCompanyId)

      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('not found or access denied')
    })
  })
})
