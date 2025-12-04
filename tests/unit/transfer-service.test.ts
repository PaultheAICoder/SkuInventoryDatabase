/**
 * Unit tests for transfer service functions
 * Tests transfer transaction creation and validation with mocked Prisma
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

// Mock getComponentQuantity before imports
vi.mock('@/services/inventory', async () => {
  const actual = await vi.importActual('@/services/inventory')
  return {
    ...actual,
    getComponentQuantity: vi.fn(),
  }
})

// Mock prisma before imports
vi.mock('@/lib/db', () => ({
  prisma: {
    component: {
      findFirst: vi.fn(),
    },
    location: {
      findFirst: vi.fn(),
    },
    transaction: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

import { createTransferTransaction } from '@/services/transfer'
import { getComponentQuantity } from '@/services/inventory'
import { prisma } from '@/lib/db'

describe('Transfer Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createTransferTransaction', () => {
    const baseParams = {
      companyId: 'company-1',
      componentId: 'comp-1',
      quantity: 10,
      fromLocationId: 'loc-1',
      toLocationId: 'loc-2',
      date: new Date('2024-01-15'),
      notes: 'Transfer notes',
      createdById: 'user-1',
    }

    it('rejects transfer to same location', async () => {
      await expect(
        createTransferTransaction({
          ...baseParams,
          fromLocationId: 'loc-1',
          toLocationId: 'loc-1',
        })
      ).rejects.toThrow('Cannot transfer to the same location')

      // Should not even start the transaction
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it('rejects transfer when component not found', async () => {
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          component: { findFirst: vi.fn().mockResolvedValue(null) },
          location: { findFirst: vi.fn() },
          transaction: { create: vi.fn() },
        }
        return callback(tx as unknown as Prisma.TransactionClient)
      })

      await expect(createTransferTransaction(baseParams)).rejects.toThrow(
        'Component not found'
      )
    })

    it('rejects transfer when source location not found', async () => {
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          component: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'comp-1',
              name: 'Test Component',
              costPerUnit: new Prisma.Decimal(10),
            }),
          },
          location: {
            findFirst: vi.fn().mockImplementation(({ where }) => {
              if (where.id === 'loc-1') return null // source not found
              return {
                id: 'loc-2',
                name: 'Destination',
                isActive: true,
              }
            }),
          },
          transaction: { create: vi.fn() },
        }
        return callback(tx as unknown as Prisma.TransactionClient)
      })

      await expect(createTransferTransaction(baseParams)).rejects.toThrow(
        'Source location not found or not active'
      )
    })

    it('rejects transfer when destination location not active', async () => {
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          component: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'comp-1',
              name: 'Test Component',
              costPerUnit: new Prisma.Decimal(10),
            }),
          },
          location: {
            findFirst: vi.fn().mockImplementation(({ where }) => {
              if (where.id === 'loc-1')
                return {
                  id: 'loc-1',
                  name: 'Source',
                  isActive: true,
                }
              return null // destination not found/not active
            }),
          },
          transaction: { create: vi.fn() },
        }
        return callback(tx as unknown as Prisma.TransactionClient)
      })

      await expect(createTransferTransaction(baseParams)).rejects.toThrow(
        'Destination location not found or not active'
      )
    })

    it('rejects transfer when insufficient inventory at source', async () => {
      vi.mocked(getComponentQuantity).mockResolvedValue(5) // Only 5 available

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          component: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'comp-1',
              name: 'Test Component',
              costPerUnit: new Prisma.Decimal(10),
            }),
          },
          location: {
            findFirst: vi.fn().mockImplementation(({ where }) => {
              return {
                id: where.id,
                name: where.id === 'loc-1' ? 'Source' : 'Destination',
                isActive: true,
              }
            }),
          },
          transaction: { create: vi.fn() },
        }
        return callback(tx as unknown as Prisma.TransactionClient)
      })

      await expect(createTransferTransaction(baseParams)).rejects.toThrow(
        'Insufficient inventory at source location. Available: 5, Required: 10'
      )
    })

    it('creates transaction with two lines (negative and positive)', async () => {
      vi.mocked(getComponentQuantity).mockResolvedValue(100) // Plenty available

      const createdTransaction = {
        id: 'trans-1',
        type: 'transfer',
        date: new Date('2024-01-15'),
        notes: 'Transfer notes',
        fromLocationId: 'loc-1',
        toLocationId: 'loc-2',
        createdAt: new Date(),
        createdBy: { id: 'user-1', name: 'Test User' },
        fromLocation: { id: 'loc-1', name: 'Source Warehouse' },
        toLocation: { id: 'loc-2', name: 'Destination Warehouse' },
        lines: [
          {
            id: 'line-1',
            componentId: 'comp-1',
            quantityChange: new Prisma.Decimal(-10),
            costPerUnit: new Prisma.Decimal(10),
            component: { id: 'comp-1', name: 'Test Component', skuCode: 'TC-001' },
          },
          {
            id: 'line-2',
            componentId: 'comp-1',
            quantityChange: new Prisma.Decimal(10),
            costPerUnit: new Prisma.Decimal(10),
            component: { id: 'comp-1', name: 'Test Component', skuCode: 'TC-001' },
          },
        ],
      }

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          component: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'comp-1',
              name: 'Test Component',
              costPerUnit: new Prisma.Decimal(10),
            }),
          },
          location: {
            findFirst: vi.fn().mockImplementation(({ where }) => {
              return {
                id: where.id,
                name: where.id === 'loc-1' ? 'Source Warehouse' : 'Destination Warehouse',
                isActive: true,
              }
            }),
          },
          transaction: {
            create: vi.fn().mockResolvedValue(createdTransaction),
          },
        }
        return callback(tx as unknown as Prisma.TransactionClient)
      })

      const result = await createTransferTransaction(baseParams)

      expect(result.id).toBe('trans-1')
      expect(result.type).toBe('transfer')
      expect(result.lines).toHaveLength(2)
      // First line should be negative (deduction from source)
      expect(Number(result.lines[0].quantityChange)).toBe(-10)
      // Second line should be positive (addition to destination)
      expect(Number(result.lines[1].quantityChange)).toBe(10)
    })

    it('uses $transaction for atomicity', async () => {
      vi.mocked(getComponentQuantity).mockResolvedValue(100)

      const createdTransaction = {
        id: 'trans-1',
        type: 'transfer',
        date: new Date('2024-01-15'),
        notes: null,
        fromLocationId: 'loc-1',
        toLocationId: 'loc-2',
        createdAt: new Date(),
        createdBy: { id: 'user-1', name: 'Test User' },
        fromLocation: { id: 'loc-1', name: 'Source' },
        toLocation: { id: 'loc-2', name: 'Destination' },
        lines: [],
      }

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          component: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'comp-1',
              name: 'Test Component',
              costPerUnit: new Prisma.Decimal(10),
            }),
          },
          location: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'loc-1',
              name: 'Location',
              isActive: true,
            }),
          },
          transaction: {
            create: vi.fn().mockResolvedValue(createdTransaction),
          },
        }
        return callback(tx as unknown as Prisma.TransactionClient)
      })

      await createTransferTransaction(baseParams)

      // Verify $transaction was used for atomicity
      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function))
    })

    it('returns correct TransferResult structure', async () => {
      vi.mocked(getComponentQuantity).mockResolvedValue(100)

      const createdTransaction = {
        id: 'trans-1',
        type: 'transfer',
        date: new Date('2024-01-15'),
        notes: 'Transfer notes',
        fromLocationId: 'loc-1',
        toLocationId: 'loc-2',
        createdAt: new Date('2024-01-15T12:00:00Z'),
        createdBy: { id: 'user-1', name: 'Test User' },
        fromLocation: { id: 'loc-1', name: 'Source Warehouse' },
        toLocation: { id: 'loc-2', name: 'Destination Warehouse' },
        lines: [
          {
            id: 'line-1',
            component: { id: 'comp-1', name: 'Test Component', skuCode: 'TC-001' },
            quantityChange: new Prisma.Decimal(-10),
            costPerUnit: new Prisma.Decimal(10),
          },
          {
            id: 'line-2',
            component: { id: 'comp-1', name: 'Test Component', skuCode: 'TC-001' },
            quantityChange: new Prisma.Decimal(10),
            costPerUnit: new Prisma.Decimal(10),
          },
        ],
      }

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          component: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'comp-1',
              name: 'Test Component',
              costPerUnit: new Prisma.Decimal(10),
            }),
          },
          location: {
            findFirst: vi.fn().mockImplementation(({ where }) => ({
              id: where.id,
              name: where.id === 'loc-1' ? 'Source Warehouse' : 'Destination Warehouse',
              isActive: true,
            })),
          },
          transaction: {
            create: vi.fn().mockResolvedValue(createdTransaction),
          },
        }
        return callback(tx as unknown as Prisma.TransactionClient)
      })

      const result = await createTransferTransaction(baseParams)

      // Verify TransferResult structure
      expect(result).toMatchObject({
        id: 'trans-1',
        type: 'transfer',
        componentId: 'comp-1',
        quantity: 10,
        fromLocationId: 'loc-1',
        toLocationId: 'loc-2',
        notes: 'Transfer notes',
      })
      expect(result.fromLocation).toEqual({ id: 'loc-1', name: 'Source Warehouse' })
      expect(result.toLocation).toEqual({ id: 'loc-2', name: 'Destination Warehouse' })
      expect(result.createdBy).toEqual({ id: 'user-1', name: 'Test User' })
      expect(result.lines).toHaveLength(2)
    })
  })
})
