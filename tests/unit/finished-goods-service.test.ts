/**
 * Unit tests for finished goods service functions
 * Tests finished goods inventory queries and operations with mocked Prisma
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

// Mock prisma before imports
vi.mock('@/lib/db', () => ({
  prisma: {
    finishedGoodsLine: {
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    finishedGoodsBalance: {
      aggregate: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
      upsert: vi.fn(),
    },
    location: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    transaction: {
      create: vi.fn(),
    },
    sKU: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

import {
  getSkuQuantity,
  getSkuQuantities,
  getSkuInventorySummary,
  adjustFinishedGoods,
  transferFinishedGoods,
  receiveFinishedGoods,
} from '@/services/finished-goods'
import { prisma } from '@/lib/db'

describe('Finished Goods Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getSkuQuantity', () => {
    it('returns global total when no locationId', async () => {
      vi.mocked(prisma.sKU.findFirst).mockResolvedValue({ id: 'sku-1' } as never)
      vi.mocked(prisma.finishedGoodsBalance.aggregate).mockResolvedValue({
        _sum: { quantity: new Prisma.Decimal(150) },
      } as never)

      const result = await getSkuQuantity('sku-1', 'company-1')

      expect(result).toBe(150)
      expect(prisma.sKU.findFirst).toHaveBeenCalledWith({
        where: { id: 'sku-1', companyId: 'company-1' },
        select: { id: true },
      })
      expect(prisma.finishedGoodsBalance.aggregate).toHaveBeenCalledWith({
        where: { skuId: 'sku-1' },
        _sum: { quantity: true },
      })
    })

    it('returns location-specific total when locationId provided', async () => {
      vi.mocked(prisma.sKU.findFirst).mockResolvedValue({ id: 'sku-1' } as never)
      vi.mocked(prisma.finishedGoodsBalance.findUnique).mockResolvedValue({
        quantity: new Prisma.Decimal(75),
      } as never)

      const result = await getSkuQuantity('sku-1', 'company-1', 'loc-1')

      expect(result).toBe(75)
      expect(prisma.finishedGoodsBalance.findUnique).toHaveBeenCalledWith({
        where: { skuId_locationId: { skuId: 'sku-1', locationId: 'loc-1' } },
        select: { quantity: true },
      })
    })

    it('returns 0 when no finished goods balance exists', async () => {
      vi.mocked(prisma.sKU.findFirst).mockResolvedValue({ id: 'sku-new' } as never)
      vi.mocked(prisma.finishedGoodsBalance.aggregate).mockResolvedValue({
        _sum: { quantity: null },
      } as never)

      const result = await getSkuQuantity('sku-new', 'company-1')

      expect(result).toBe(0)
    })

    it('throws error when SKU does not belong to company', async () => {
      vi.mocked(prisma.sKU.findFirst).mockResolvedValue(null)

      await expect(getSkuQuantity('sku-1', 'wrong-company')).rejects.toThrow(
        'SKU not found or access denied'
      )
    })
  })

  describe('getSkuQuantities', () => {
    it('returns quantities for multiple SKUs', async () => {
      vi.mocked(prisma.sKU.findMany).mockResolvedValue([
        { id: 'sku-1' },
        { id: 'sku-2' },
      ] as never)
      vi.mocked(prisma.finishedGoodsBalance.groupBy).mockResolvedValue([
        { skuId: 'sku-1', _sum: { quantity: new Prisma.Decimal(100) } },
        { skuId: 'sku-2', _sum: { quantity: new Prisma.Decimal(50) } },
      ] as never)

      const result = await getSkuQuantities(['sku-1', 'sku-2', 'sku-3'], 'company-1')

      expect(result.get('sku-1')).toBe(100)
      expect(result.get('sku-2')).toBe(50)
      expect(result.get('sku-3')).toBe(0) // Not in results, defaults to 0
    })

    it('handles empty SKU list', async () => {
      const result = await getSkuQuantities([], 'company-1')

      expect(result.size).toBe(0)
      // Should not call findMany for empty list
      expect(prisma.sKU.findMany).not.toHaveBeenCalled()
    })

    it('filters by location when provided', async () => {
      vi.mocked(prisma.sKU.findMany).mockResolvedValue([
        { id: 'sku-1' },
        { id: 'sku-2' },
      ] as never)
      vi.mocked(prisma.finishedGoodsBalance.findMany).mockResolvedValue([
        { skuId: 'sku-1', quantity: new Prisma.Decimal(50) },
      ] as never)

      await getSkuQuantities(['sku-1', 'sku-2'], 'company-1', 'loc-1')

      expect(prisma.finishedGoodsBalance.findMany).toHaveBeenCalledWith({
        where: {
          skuId: { in: ['sku-1', 'sku-2'] },
          locationId: 'loc-1',
        },
        select: { skuId: true, quantity: true },
      })
    })

    it('handles null quantity sums', async () => {
      vi.mocked(prisma.sKU.findMany).mockResolvedValue([{ id: 'sku-1' }] as never)
      vi.mocked(prisma.finishedGoodsBalance.groupBy).mockResolvedValue([
        { skuId: 'sku-1', _sum: { quantity: null } },
      ] as never)

      const result = await getSkuQuantities(['sku-1'], 'company-1')

      expect(result.get('sku-1')).toBe(0)
    })

    it('returns zeros for SKUs not owned by company', async () => {
      vi.mocked(prisma.sKU.findMany).mockResolvedValue([]) // No valid SKUs

      const result = await getSkuQuantities(['sku-1', 'sku-2'], 'wrong-company')

      expect(result.get('sku-1')).toBe(0)
      expect(result.get('sku-2')).toBe(0)
      // groupBy should not be called when no valid SKUs
      expect(prisma.finishedGoodsBalance.groupBy).not.toHaveBeenCalled()
    })
  })

  describe('getSkuInventorySummary', () => {
    it('groups quantities by location', async () => {
      vi.mocked(prisma.sKU.findFirst).mockResolvedValue({ id: 'sku-1' } as never)
      vi.mocked(prisma.finishedGoodsBalance.findMany).mockResolvedValue([
        { location: { id: 'loc-1', name: 'Warehouse A', type: 'warehouse' }, quantity: new Prisma.Decimal(100) },
        { location: { id: 'loc-2', name: 'FBA Center', type: 'fba' }, quantity: new Prisma.Decimal(50) },
      ] as never)

      const result = await getSkuInventorySummary('sku-1', 'company-1')

      expect(result.totalQuantity).toBe(150)
      expect(result.byLocation).toHaveLength(2)
    })

    it('includes location details', async () => {
      vi.mocked(prisma.sKU.findFirst).mockResolvedValue({ id: 'sku-1' } as never)
      vi.mocked(prisma.finishedGoodsBalance.findMany).mockResolvedValue([
        { location: { id: 'loc-1', name: 'Main Warehouse', type: 'warehouse' }, quantity: new Prisma.Decimal(100) },
      ] as never)

      const result = await getSkuInventorySummary('sku-1', 'company-1')

      expect(result.byLocation[0]).toMatchObject({
        locationId: 'loc-1',
        locationName: 'Main Warehouse',
        locationType: 'warehouse',
        quantity: 100,
      })
    })

    it('returns empty result when no balances exist (zero quantities filtered)', async () => {
      vi.mocked(prisma.sKU.findFirst).mockResolvedValue({ id: 'sku-1' } as never)
      // The query already filters out zero quantities, so empty means no non-zero balances
      vi.mocked(prisma.finishedGoodsBalance.findMany).mockResolvedValue([] as never)

      const result = await getSkuInventorySummary('sku-1', 'company-1')

      expect(result.byLocation).toHaveLength(0)
      expect(result.totalQuantity).toBe(0)
    })

    it('sorts by quantity descending', async () => {
      vi.mocked(prisma.sKU.findFirst).mockResolvedValue({ id: 'sku-1' } as never)
      vi.mocked(prisma.finishedGoodsBalance.findMany).mockResolvedValue([
        { location: { id: 'loc-1', name: 'Small', type: 'warehouse' }, quantity: new Prisma.Decimal(50) },
        { location: { id: 'loc-2', name: 'Large', type: 'warehouse' }, quantity: new Prisma.Decimal(150) },
        { location: { id: 'loc-3', name: 'Medium', type: 'warehouse' }, quantity: new Prisma.Decimal(100) },
      ] as never)

      const result = await getSkuInventorySummary('sku-1', 'company-1')

      expect(result.byLocation[0].quantity).toBe(150)
      expect(result.byLocation[1].quantity).toBe(100)
      expect(result.byLocation[2].quantity).toBe(50)
    })

    it('throws error when SKU does not belong to company', async () => {
      vi.mocked(prisma.sKU.findFirst).mockResolvedValue(null)

      await expect(getSkuInventorySummary('sku-1', 'wrong-company')).rejects.toThrow(
        'SKU not found or access denied'
      )
    })
  })

  describe('adjustFinishedGoods', () => {
    it('creates adjustment transaction with finished goods line and updates balance', async () => {
      const createdTransaction = { id: 'trans-1' }

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const mockCreate = vi.fn().mockResolvedValue(createdTransaction)
        const mockUpsert = vi.fn().mockResolvedValue({})
        const tx = {
          transaction: { create: mockCreate },
          finishedGoodsBalance: { upsert: mockUpsert },
        }
        const result = await callback(tx as unknown as Prisma.TransactionClient)
        // Verify transaction create was called
        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              companyId: 'company-1',
              type: 'adjustment',
              skuId: 'sku-1',
              reason: 'Physical count correction',
            }),
          })
        )
        // Verify balance update was called
        expect(mockUpsert).toHaveBeenCalled()
        return result
      })

      const result = await adjustFinishedGoods({
        companyId: 'company-1',
        skuId: 'sku-1',
        locationId: 'loc-1',
        quantity: 25,
        reason: 'Physical count correction',
        notes: 'Adjustment note',
        date: new Date('2024-01-15'),
        createdById: 'user-1',
      })

      expect(result.id).toBe('trans-1')
    })

    it('allows positive and negative adjustments', async () => {
      const createdTransaction = { id: 'trans-1' }
      let quantityUsed: number | undefined

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const mockCreate = vi.fn().mockResolvedValue(createdTransaction)
        const mockUpsert = vi.fn().mockImplementation((args) => {
          quantityUsed = args.create.quantity.toNumber()
          return Promise.resolve({})
        })
        const tx = {
          transaction: { create: mockCreate },
          finishedGoodsBalance: { upsert: mockUpsert },
        }
        return callback(tx as unknown as Prisma.TransactionClient)
      })

      // Positive adjustment
      await adjustFinishedGoods({
        companyId: 'company-1',
        skuId: 'sku-1',
        locationId: 'loc-1',
        quantity: 10,
        reason: 'Found extra',
        date: new Date(),
        createdById: 'user-1',
      })
      expect(quantityUsed).toBe(10)

      // Negative adjustment
      await adjustFinishedGoods({
        companyId: 'company-1',
        skuId: 'sku-1',
        locationId: 'loc-1',
        quantity: -5,
        reason: 'Damaged goods',
        date: new Date(),
        createdById: 'user-1',
      })
      expect(quantityUsed).toBe(-5)
    })
  })

  describe('transferFinishedGoods', () => {
    it('rejects transfer to same location', async () => {
      await expect(
        transferFinishedGoods({
          companyId: 'company-1',
          skuId: 'sku-1',
          fromLocationId: 'loc-1',
          toLocationId: 'loc-1',
          quantity: 10,
          date: new Date(),
          createdById: 'user-1',
        })
      ).rejects.toThrow('Cannot transfer to the same location')
    })

    it('rejects when insufficient at source', async () => {
      // Mock SKU verification for getSkuQuantity call (outside transaction)
      vi.mocked(prisma.sKU.findFirst).mockResolvedValue({ id: 'sku-1' } as never)
      // Mock getSkuQuantity returning insufficient amount - now uses finishedGoodsBalance
      vi.mocked(prisma.finishedGoodsBalance.findUnique).mockResolvedValue({
        quantity: new Prisma.Decimal(5),
      } as never)

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          location: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'loc-1',
              name: 'Location',
              isActive: true,
            }),
          },
          transaction: { create: vi.fn() },
          finishedGoodsBalance: { upsert: vi.fn() },
        }
        return callback(tx as unknown as Prisma.TransactionClient)
      })

      await expect(
        transferFinishedGoods({
          companyId: 'company-1',
          skuId: 'sku-1',
          fromLocationId: 'loc-1',
          toLocationId: 'loc-2',
          quantity: 10,
          date: new Date(),
          createdById: 'user-1',
        })
      ).rejects.toThrow('Insufficient finished goods at source location')
    })

    it('creates two finished goods lines and updates balances', async () => {
      // Mock SKU verification for getSkuQuantity call (outside transaction)
      vi.mocked(prisma.sKU.findFirst).mockResolvedValue({ id: 'sku-1' } as never)
      // Mock getSkuQuantity to return sufficient amount using balance table
      vi.mocked(prisma.finishedGoodsBalance.findUnique).mockResolvedValue({
        quantity: new Prisma.Decimal(100),
      } as never)

      const createdTransaction = { id: 'trans-1' }

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const mockCreate = vi.fn().mockResolvedValue(createdTransaction)
        const mockUpsert = vi.fn().mockResolvedValue({})
        const tx = {
          location: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'loc-1',
              name: 'Location',
              isActive: true,
            }),
          },
          transaction: {
            create: mockCreate,
          },
          finishedGoodsBalance: {
            upsert: mockUpsert,
          },
        }
        const result = await callback(tx as unknown as Prisma.TransactionClient)
        // Verify transaction create was called with two lines
        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              type: 'transfer',
              fromLocationId: 'loc-1',
              toLocationId: 'loc-2',
              finishedGoodsLines: {
                create: expect.arrayContaining([
                  expect.objectContaining({
                    locationId: 'loc-1',
                    quantityChange: new Prisma.Decimal(-10),
                  }),
                  expect.objectContaining({
                    locationId: 'loc-2',
                    quantityChange: new Prisma.Decimal(10),
                  }),
                ]),
              },
            }),
          })
        )
        // Verify balance updates were called (from and to locations)
        expect(mockUpsert).toHaveBeenCalledTimes(2)
        return result
      })

      const result = await transferFinishedGoods({
        companyId: 'company-1',
        skuId: 'sku-1',
        fromLocationId: 'loc-1',
        toLocationId: 'loc-2',
        quantity: 10,
        date: new Date(),
        createdById: 'user-1',
      })

      expect(result.id).toBe('trans-1')
    })
  })

  describe('receiveFinishedGoods', () => {
    it('creates receipt transaction with finished goods line and updates balance', async () => {
      const createdTransaction = { id: 'trans-1' }

      // Mock $transaction for the receive operation
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const mockCreate = vi.fn().mockResolvedValue(createdTransaction)
        const mockUpsert = vi.fn().mockResolvedValue({})
        const tx = {
          transaction: { create: mockCreate },
          finishedGoodsBalance: { upsert: mockUpsert },
        }
        const result = await callback(tx as unknown as Prisma.TransactionClient)
        // Verify transaction create was called with correct data
        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              companyId: 'company-1',
              type: 'receipt',
              skuId: 'sku-1',
              supplier: 'Customer Return',
              notes: 'Return from order #12345',
              createdById: 'user-1',
              locationId: 'loc-1',
              finishedGoodsLines: {
                create: expect.objectContaining({
                  skuId: 'sku-1',
                  locationId: 'loc-1',
                  quantityChange: new Prisma.Decimal(25),
                  costPerUnit: new Prisma.Decimal(10.50),
                }),
              },
            }),
            select: { id: true },
          })
        )
        // Verify balance update was called
        expect(mockUpsert).toHaveBeenCalled()
        return result
      })

      // Mock getSkuQuantity call for newBalance (after transaction)
      vi.mocked(prisma.sKU.findFirst).mockResolvedValue({ id: 'sku-1' } as never)
      vi.mocked(prisma.finishedGoodsBalance.findUnique).mockResolvedValue({
        quantity: new Prisma.Decimal(125),
      } as never)

      const result = await receiveFinishedGoods({
        companyId: 'company-1',
        skuId: 'sku-1',
        locationId: 'loc-1',
        quantity: 25,
        source: 'Customer Return',
        costPerUnit: 10.50,
        notes: 'Return from order #12345',
        date: new Date('2024-01-15'),
        createdById: 'user-1',
      })

      expect(result.id).toBe('trans-1')
      expect(result.newBalance).toBe(125)
    })

    it('works without optional costPerUnit', async () => {
      const createdTransaction = { id: 'trans-1' }

      // Mock $transaction for the receive operation
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const mockCreate = vi.fn().mockResolvedValue(createdTransaction)
        const mockUpsert = vi.fn().mockResolvedValue({})
        const tx = {
          transaction: { create: mockCreate },
          finishedGoodsBalance: { upsert: mockUpsert },
        }
        const result = await callback(tx as unknown as Prisma.TransactionClient)
        // Verify costPerUnit is null
        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              finishedGoodsLines: {
                create: expect.objectContaining({
                  costPerUnit: null,
                }),
              },
            }),
          })
        )
        return result
      })

      // Mock getSkuQuantity call for newBalance (after transaction)
      vi.mocked(prisma.sKU.findFirst).mockResolvedValue({ id: 'sku-1' } as never)
      vi.mocked(prisma.finishedGoodsBalance.findUnique).mockResolvedValue({
        quantity: new Prisma.Decimal(50),
      } as never)

      const result = await receiveFinishedGoods({
        companyId: 'company-1',
        skuId: 'sku-1',
        locationId: 'loc-1',
        quantity: 50,
        source: 'Production Correction',
        date: new Date(),
        createdById: 'user-1',
      })

      expect(result.id).toBe('trans-1')
      expect(result.newBalance).toBe(50)
    })
  })
})
