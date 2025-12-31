/**
 * Unit tests for build transaction with finished goods output
 * Tests the outputToFinishedGoods parameter and atomic transaction behavior
 *
 * Issue #79: Extend build transactions to output finished goods inventory
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

// Mock prisma before imports - including all tables used by the service
vi.mock('@/lib/db', () => ({
  prisma: {
    bOMLine: {
      findMany: vi.fn(),
    },
    transaction: {
      create: vi.fn(),
    },
    inventoryBalance: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    finishedGoodsBalance: {
      upsert: vi.fn(),
    },
    location: {
      findFirst: vi.fn(),
    },
    finishedGoodsLine: {
      create: vi.fn(),
    },
    lot: {
      findMany: vi.fn(),
    },
    lotBalance: {
      update: vi.fn(),
    },
    component: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

// Mock the location service
vi.mock('@/services/location', () => ({
  getDefaultLocationId: vi.fn(),
}))

// Mock the alert service
vi.mock('@/services/alert', () => ({
  evaluateDefectThreshold: vi.fn(),
}))

import { createBuildTransaction } from '@/services/inventory'
import { prisma } from '@/lib/db'
import { getDefaultLocationId } from '@/services/location'

describe('Build Transaction with Finished Goods Output (Issue #79)', () => {
  const mockCompanyId = 'company-123'
  const mockSkuId = 'sku-123'
  const mockBomVersionId = 'bom-123'
  const mockUserId = 'user-123'
  const mockLocationId = 'location-123'
  const mockOutputLocationId = 'output-location-456'

  const mockBomLines = [
    {
      id: 'bom-line-1',
      componentId: 'component-1',
      bomVersionId: mockBomVersionId,
      quantityPerUnit: new Prisma.Decimal(2),
      component: {
        id: 'component-1',
        costPerUnit: new Prisma.Decimal(5.00),
      },
    },
  ]

  const mockCreatedTransaction = {
    id: 'transaction-123',
    type: 'build',
    date: new Date(),
    skuId: mockSkuId,
    bomVersionId: mockBomVersionId,
    locationId: mockLocationId,
    salesChannel: null,
    unitsBuild: 10,
    unitBomCost: new Prisma.Decimal(10),
    totalBomCost: new Prisma.Decimal(100),
    notes: null,
    defectCount: null,
    defectNotes: null,
    affectedUnits: null,
    createdAt: new Date(),
    sku: { id: mockSkuId, name: 'Test SKU', internalCode: 'TST001' },
    bomVersion: { id: mockBomVersionId, versionName: 'v1.0' },
    location: { id: mockLocationId, name: 'Main Warehouse' },
    lines: [
      {
        id: 'line-1',
        component: { id: 'component-1', name: 'Test Component', skuCode: 'COMP001' },
        quantityChange: new Prisma.Decimal(-20),
        costPerUnit: new Prisma.Decimal(5.00),
      },
    ],
    createdBy: { id: mockUserId, name: 'Test User' },
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup default mocks
    vi.mocked(getDefaultLocationId).mockResolvedValue(mockLocationId)
    vi.mocked(prisma.bOMLine.findMany).mockResolvedValue(mockBomLines as never)

    // Mock component ownership verification for getComponentQuantities (Issue #199)
    vi.mocked(prisma.component.findMany).mockResolvedValue([
      { id: 'component-1' },
    ] as never)

    // Mock inventoryBalance for checkInsufficientInventory (returns sufficient inventory)
    // Uses groupBy when no locationId, findMany when locationId is provided
    vi.mocked(prisma.inventoryBalance.groupBy).mockResolvedValue([
      {
        componentId: 'component-1',
        _sum: { quantity: new Prisma.Decimal(1000) }, // Plenty of inventory
      },
    ] as never)
    // Also mock findMany for location-specific queries (when locationId is provided)
    vi.mocked(prisma.inventoryBalance.findMany).mockResolvedValue([
      {
        componentId: 'component-1',
        quantity: new Prisma.Decimal(1000), // Plenty of inventory
      },
    ] as never)
  })

  // Helper to create transaction with lot info on lines
  const mockTransactionWithLots = {
    ...mockCreatedTransaction,
    lines: mockCreatedTransaction.lines.map(l => ({ ...l, lotId: null, lot: null })),
  }

  // Helper to create mock transaction client with lot support
  // Now includes bOMLine since it's fetched inside the transaction for atomicity (Issue #296)
  // Also includes inventoryBalance and finishedGoodsBalance for balance updates
  // Updated for Issue #303: consumeLotsForBuildTx now creates transaction lines directly
  function createMockTxClient(overrides: {
    locationResult?: { id: string; name: string } | null
    finishedGoodsCallback?: () => void
  } = {}) {
    const locationValue = overrides.locationResult === null
      ? null
      : overrides.locationResult ?? { id: mockLocationId, name: 'Main Warehouse' }
    return {
      bOMLine: {
        findMany: vi.fn().mockResolvedValue(mockBomLines), // BOM lines now fetched inside transaction
      },
      location: {
        findFirst: vi.fn().mockResolvedValue(locationValue),
      },
      transaction: {
        create: vi.fn().mockResolvedValue({ id: 'transaction-123' }), // Initial create returns minimal object
        findUniqueOrThrow: vi.fn().mockResolvedValue(mockTransactionWithLots), // Re-fetch with includes
      },
      transactionLine: {
        create: vi.fn().mockResolvedValue({ id: 'line-1' }), // Now called by consumeLotsForBuildTx
      },
      finishedGoodsLine: {
        create: vi.fn().mockImplementation(() => {
          if (overrides.finishedGoodsCallback) overrides.finishedGoodsCallback()
          return Promise.resolve({ id: 'fg-line-1' })
        }),
      },
      lot: {
        findMany: vi.fn().mockResolvedValue([]), // No lots - pooled inventory
      },
      lotBalance: {
        update: vi.fn().mockResolvedValue({}),
      },
      inventoryBalance: {
        upsert: vi.fn().mockResolvedValue({}),
      },
      finishedGoodsBalance: {
        upsert: vi.fn().mockResolvedValue({}),
      },
    }
  }

  describe('outputToFinishedGoods parameter behavior', () => {
    it('outputs to finished goods by default (when outputToFinishedGoods is not specified)', async () => {
      // Setup: Mock $transaction to capture what operations are performed
      let finishedGoodsCreated = false

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = createMockTxClient({ finishedGoodsCallback: () => { finishedGoodsCreated = true } })
        return callback(tx as unknown as Prisma.TransactionClient)
      })

      // Execute: Call without outputToFinishedGoods (should default to true)
      const result = await createBuildTransaction({
        companyId: mockCompanyId,
        skuId: mockSkuId,
        bomVersionId: mockBomVersionId,
        unitsToBuild: 10,
        date: new Date(),
        createdById: mockUserId,
        // outputToFinishedGoods NOT specified - should default to true
      })

      // Verify: FG line was created
      expect(finishedGoodsCreated).toBe(true)
      expect(result.transaction.outputToFinishedGoods).toBe(true)
    })

    it('outputs to finished goods when outputToFinishedGoods is explicitly true', async () => {
      let finishedGoodsCreated = false

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = createMockTxClient({ finishedGoodsCallback: () => { finishedGoodsCreated = true } })
        return callback(tx as unknown as Prisma.TransactionClient)
      })

      const result = await createBuildTransaction({
        companyId: mockCompanyId,
        skuId: mockSkuId,
        bomVersionId: mockBomVersionId,
        unitsToBuild: 10,
        date: new Date(),
        createdById: mockUserId,
        outputToFinishedGoods: true,
      })

      expect(finishedGoodsCreated).toBe(true)
      expect(result.transaction.outputToFinishedGoods).toBe(true)
    })

    it('does NOT output to finished goods when outputToFinishedGoods is false', async () => {
      let finishedGoodsCreated = false

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = createMockTxClient({ finishedGoodsCallback: () => { finishedGoodsCreated = true } })
        return callback(tx as unknown as Prisma.TransactionClient)
      })

      const result = await createBuildTransaction({
        companyId: mockCompanyId,
        skuId: mockSkuId,
        bomVersionId: mockBomVersionId,
        unitsToBuild: 10,
        date: new Date(),
        createdById: mockUserId,
        outputToFinishedGoods: false,
      })

      expect(finishedGoodsCreated).toBe(false)
      expect(result.transaction.outputToFinishedGoods).toBe(false)
      expect(result.transaction.outputQuantity).toBeNull()
      expect(result.transaction.outputLocationId).toBeNull()
    })
  })

  describe('output location selection', () => {
    it('uses specified outputLocationId when provided', async () => {
      let capturedLocationId: string | null = null

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          bOMLine: { findMany: vi.fn().mockResolvedValue(mockBomLines) },
          location: {
            findFirst: vi.fn().mockResolvedValue({
              id: mockOutputLocationId,
              name: 'FG Warehouse',
            }),
          },
          transaction: {
            create: vi.fn().mockResolvedValue({ id: 'transaction-123' }),
            findUniqueOrThrow: vi.fn().mockResolvedValue(mockTransactionWithLots),
          },
          transactionLine: { create: vi.fn().mockResolvedValue({ id: 'line-1' }) },
          finishedGoodsLine: {
            create: vi.fn().mockImplementation((args: { data: { locationId: string } }) => {
              capturedLocationId = args.data.locationId
              return Promise.resolve({ id: 'fg-line-1' })
            }),
          },
          lot: { findMany: vi.fn().mockResolvedValue([]) },
          lotBalance: { update: vi.fn().mockResolvedValue({}) },
          inventoryBalance: { upsert: vi.fn().mockResolvedValue({}) },
          finishedGoodsBalance: { upsert: vi.fn().mockResolvedValue({}) },
        }
        return callback(tx as unknown as Prisma.TransactionClient)
      })

      await createBuildTransaction({
        companyId: mockCompanyId,
        skuId: mockSkuId,
        bomVersionId: mockBomVersionId,
        unitsToBuild: 10,
        date: new Date(),
        createdById: mockUserId,
        outputToFinishedGoods: true,
        outputLocationId: mockOutputLocationId,
      })

      expect(capturedLocationId).toBe(mockOutputLocationId)
    })

    it('uses default location when outputLocationId not provided and outputToFinishedGoods is true', async () => {
      let capturedLocationId: string | null = null

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          bOMLine: { findMany: vi.fn().mockResolvedValue(mockBomLines) },
          location: {
            findFirst: vi.fn().mockResolvedValue({
              id: mockLocationId,
              name: 'Main Warehouse',
            }),
          },
          transaction: {
            create: vi.fn().mockResolvedValue({ id: 'transaction-123' }),
            findUniqueOrThrow: vi.fn().mockResolvedValue(mockTransactionWithLots),
          },
          transactionLine: { create: vi.fn().mockResolvedValue({ id: 'line-1' }) },
          finishedGoodsLine: {
            create: vi.fn().mockImplementation((args: { data: { locationId: string } }) => {
              capturedLocationId = args.data.locationId
              return Promise.resolve({ id: 'fg-line-1' })
            }),
          },
          lot: { findMany: vi.fn().mockResolvedValue([]) },
          lotBalance: { update: vi.fn().mockResolvedValue({}) },
          inventoryBalance: { upsert: vi.fn().mockResolvedValue({}) },
          finishedGoodsBalance: { upsert: vi.fn().mockResolvedValue({}) },
        }
        return callback(tx as unknown as Prisma.TransactionClient)
      })

      await createBuildTransaction({
        companyId: mockCompanyId,
        skuId: mockSkuId,
        bomVersionId: mockBomVersionId,
        unitsToBuild: 10,
        date: new Date(),
        createdById: mockUserId,
        // outputToFinishedGoods defaults to true
        // outputLocationId NOT provided - should use default
      })

      // Should have used the default location from getDefaultLocationId
      expect(capturedLocationId).toBe(mockLocationId)
      expect(getDefaultLocationId).toHaveBeenCalledWith(mockCompanyId)
    })

    it('throws error when no default location exists and none specified (Issue #334 fix)', async () => {
      // Setup: No default location
      vi.mocked(getDefaultLocationId).mockResolvedValue(null)

      // Should throw error when outputToFinishedGoods is true but no location is available
      // This is the fix for Issue #334 - previously it silently skipped FG output,
      // causing FG quantities to show as 0 on the SKUs page
      await expect(
        createBuildTransaction({
          companyId: mockCompanyId,
          skuId: mockSkuId,
          bomVersionId: mockBomVersionId,
          unitsToBuild: 10,
          date: new Date(),
          createdById: mockUserId,
          outputToFinishedGoods: true, // enabled, but no location available
        })
      ).rejects.toThrow('Cannot create build transaction: No output location specified and company has no default location')
    })
  })

  describe('output quantity', () => {
    it('uses specified outputQuantity when provided', async () => {
      let capturedQuantity: number | null = null

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          bOMLine: { findMany: vi.fn().mockResolvedValue(mockBomLines) },
          location: {
            findFirst: vi.fn().mockResolvedValue({
              id: mockLocationId,
              name: 'Main Warehouse',
            }),
          },
          transaction: {
            create: vi.fn().mockResolvedValue({ id: 'transaction-123' }),
            findUniqueOrThrow: vi.fn().mockResolvedValue(mockTransactionWithLots),
          },
          transactionLine: { create: vi.fn().mockResolvedValue({ id: 'line-1' }) },
          finishedGoodsLine: {
            create: vi.fn().mockImplementation((args: { data: { quantityChange: Prisma.Decimal } }) => {
              capturedQuantity = args.data.quantityChange.toNumber()
              return Promise.resolve({ id: 'fg-line-1' })
            }),
          },
          lot: { findMany: vi.fn().mockResolvedValue([]) },
          lotBalance: { update: vi.fn().mockResolvedValue({}) },
          inventoryBalance: { upsert: vi.fn().mockResolvedValue({}) },
          finishedGoodsBalance: { upsert: vi.fn().mockResolvedValue({}) },
        }
        return callback(tx as unknown as Prisma.TransactionClient)
      })

      const result = await createBuildTransaction({
        companyId: mockCompanyId,
        skuId: mockSkuId,
        bomVersionId: mockBomVersionId,
        unitsToBuild: 10,
        date: new Date(),
        createdById: mockUserId,
        outputToFinishedGoods: true,
        outputQuantity: 8, // Less than unitsToBuild due to defects
      })

      expect(capturedQuantity).toBe(8)
      expect(result.transaction.outputQuantity).toBe(8)
    })

    it('defaults outputQuantity to unitsToBuild when not specified', async () => {
      let capturedQuantity: number | null = null

      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = {
          bOMLine: { findMany: vi.fn().mockResolvedValue(mockBomLines) },
          location: {
            findFirst: vi.fn().mockResolvedValue({
              id: mockLocationId,
              name: 'Main Warehouse',
            }),
          },
          transaction: {
            create: vi.fn().mockResolvedValue({ id: 'transaction-123' }),
            findUniqueOrThrow: vi.fn().mockResolvedValue(mockTransactionWithLots),
          },
          transactionLine: { create: vi.fn().mockResolvedValue({ id: 'line-1' }) },
          finishedGoodsLine: {
            create: vi.fn().mockImplementation((args: { data: { quantityChange: Prisma.Decimal } }) => {
              capturedQuantity = args.data.quantityChange.toNumber()
              return Promise.resolve({ id: 'fg-line-1' })
            }),
          },
          lot: { findMany: vi.fn().mockResolvedValue([]) },
          lotBalance: { update: vi.fn().mockResolvedValue({}) },
          inventoryBalance: { upsert: vi.fn().mockResolvedValue({}) },
          finishedGoodsBalance: { upsert: vi.fn().mockResolvedValue({}) },
        }
        return callback(tx as unknown as Prisma.TransactionClient)
      })

      const result = await createBuildTransaction({
        companyId: mockCompanyId,
        skuId: mockSkuId,
        bomVersionId: mockBomVersionId,
        unitsToBuild: 15,
        date: new Date(),
        createdById: mockUserId,
        outputToFinishedGoods: true,
        // outputQuantity NOT specified - should default to unitsToBuild
      })

      expect(capturedQuantity).toBe(15)
      expect(result.transaction.outputQuantity).toBe(15)
    })
  })

  describe('atomic transaction behavior', () => {
    it('uses prisma.$transaction for atomicity', async () => {
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = createMockTxClient()
        return callback(tx as unknown as Prisma.TransactionClient)
      })

      await createBuildTransaction({
        companyId: mockCompanyId,
        skuId: mockSkuId,
        bomVersionId: mockBomVersionId,
        unitsToBuild: 10,
        date: new Date(),
        createdById: mockUserId,
      })

      // Verify $transaction was called
      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    })

    it('throws error if output location validation fails', async () => {
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = createMockTxClient({ locationResult: null })
        return callback(tx as unknown as Prisma.TransactionClient)
      })

      await expect(
        createBuildTransaction({
          companyId: mockCompanyId,
          skuId: mockSkuId,
          bomVersionId: mockBomVersionId,
          unitsToBuild: 10,
          date: new Date(),
          createdById: mockUserId,
          outputToFinishedGoods: true,
          outputLocationId: 'invalid-location-id',
        })
      ).rejects.toThrow('Output location not found or not active')
    })
  })

  describe('backward compatibility', () => {
    it('existing calls without outputToFinishedGoods continue working', async () => {
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = createMockTxClient()
        return callback(tx as unknown as Prisma.TransactionClient)
      })

      // Call like the old API - should still work
      const result = await createBuildTransaction({
        companyId: mockCompanyId,
        skuId: mockSkuId,
        bomVersionId: mockBomVersionId,
        unitsToBuild: 10,
        date: new Date(),
        createdById: mockUserId,
        // No new params - should still work with defaults
      })

      expect(result.transaction).toBeDefined()
      expect(result.transaction.id).toBe('transaction-123')
    })

    it('existing calls with outputLocationId continue working', async () => {
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = createMockTxClient({ locationResult: { id: mockOutputLocationId, name: 'FG Warehouse' } })
        return callback(tx as never)
      })

      // Call like issue #72 implementation - explicit outputLocationId
      const result = await createBuildTransaction({
        companyId: mockCompanyId,
        skuId: mockSkuId,
        bomVersionId: mockBomVersionId,
        unitsToBuild: 10,
        date: new Date(),
        createdById: mockUserId,
        outputLocationId: mockOutputLocationId,
        outputQuantity: 10,
      })

      expect(result.transaction.outputLocationId).toBe(mockOutputLocationId)
      expect(result.transaction.outputQuantity).toBe(10)
    })
  })

  describe('result includes FG output info', () => {
    it('includes outputToFinishedGoods in result', async () => {
      vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
        const tx = createMockTxClient()
        return callback(tx as unknown as Prisma.TransactionClient)
      })

      const result = await createBuildTransaction({
        companyId: mockCompanyId,
        skuId: mockSkuId,
        bomVersionId: mockBomVersionId,
        unitsToBuild: 10,
        date: new Date(),
        createdById: mockUserId,
        outputToFinishedGoods: true,
      })

      expect(result.transaction.outputToFinishedGoods).toBe(true)
      expect(result.transaction.outputLocationId).toBeDefined()
      expect(result.transaction.outputQuantity).toBeDefined()
    })
  })
})
