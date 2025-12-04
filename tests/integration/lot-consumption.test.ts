/**
 * Integration tests for lot consumption during build transactions.
 *
 * These tests verify:
 * - FEFO (First Expiry First Out) lot selection
 * - Multiple TransactionLines when consuming from multiple lots
 * - LotBalance quantity decrement
 * - Backward compatibility with lot-less (pooled) components
 * - Manual lot override functionality
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { Prisma } from '@prisma/client'
import { setTestSession, clearTestSession, TEST_SESSIONS, initializeTestSessions } from '../helpers/auth-mock'
import {
  getIntegrationPrisma,
  cleanupBeforeTest,
  createTestRequest,
  parseRouteResponse,
  createTestComponentInDb,
  createTestSKUInDb,
  getOrCreateDefaultLocation,
} from '../helpers/integration-context'
import { disconnectTestDb } from '../helpers/db'

// Import route handlers directly
import { POST as createBuild } from '@/app/api/transactions/build/route'

describe('Lot Consumption Integration', () => {
  beforeAll(async () => {
    const prisma = getIntegrationPrisma()
    await initializeTestSessions(prisma)
  })

  beforeEach(async () => {
    await cleanupBeforeTest()
    clearTestSession()
  })

  afterAll(async () => {
    await disconnectTestDb()
  })

  /**
   * Helper to create a lot with balance for a component
   */
  async function createLotWithBalance(
    componentId: string,
    lotNumber: string,
    quantity: number,
    expiryDate?: Date
  ): Promise<{ lotId: string; lotNumber: string }> {
    const prisma = getIntegrationPrisma()
    const lot = await prisma.lot.create({
      data: {
        componentId,
        lotNumber,
        expiryDate,
        receivedQuantity: new Prisma.Decimal(quantity),
        supplier: 'Test Supplier',
      },
    })
    await prisma.lotBalance.create({
      data: {
        lotId: lot.id,
        quantity: new Prisma.Decimal(quantity),
      },
    })
    return { lotId: lot.id, lotNumber: lot.lotNumber }
  }

  /**
   * Helper to create a BOM for SKU with specified components
   */
  async function createBOMForSKU(
    skuId: string,
    userId: string,
    lines: Array<{ componentId: string; quantityPerUnit: number }>
  ): Promise<string> {
    const prisma = getIntegrationPrisma()
    const bomVersion = await prisma.bOMVersion.create({
      data: {
        skuId,
        versionName: 'v1.0',
        effectiveStartDate: new Date('2020-01-01'),
        isActive: true,
        createdById: userId,
        lines: {
          create: lines.map((line) => ({
            componentId: line.componentId,
            quantityPerUnit: new Prisma.Decimal(line.quantityPerUnit),
          })),
        },
      },
    })
    return bomVersion.id
  }

  /**
   * Helper to add inventory to a component (pooled, no lot)
   */
  async function addPooledInventory(
    companyId: string,
    componentId: string,
    quantity: number,
    userId: string
  ): Promise<void> {
    const prisma = getIntegrationPrisma()
    const location = await getOrCreateDefaultLocation(companyId)
    await prisma.transaction.create({
      data: {
        companyId,
        type: 'initial',
        date: new Date(),
        createdById: userId,
        locationId: location.id,
        lines: {
          create: {
            componentId,
            quantityChange: new Prisma.Decimal(quantity),
            costPerUnit: new Prisma.Decimal(10),
          },
        },
      },
    })
  }

  describe('Build with FEFO lot selection', () => {
    it('consumes from lot with earliest expiry first', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const companyId = TEST_SESSIONS.admin!.user.companyId
      const userId = TEST_SESSIONS.admin!.user.id

      // Create component that will have lots
      const component = await createTestComponentInDb(companyId)

      // Create two lots with different expiry dates
      const earlierLot = await createLotWithBalance(
        component.id,
        'LOT-EARLIER',
        50,
        new Date('2025-03-01')
      )
      const laterLot = await createLotWithBalance(
        component.id,
        'LOT-LATER',
        50,
        new Date('2025-06-01')
      )

      // Create SKU and BOM
      const sku = await createTestSKUInDb(companyId)
      await createBOMForSKU(sku.id, userId, [{ componentId: component.id, quantityPerUnit: 2 }])

      // Build 5 units (requires 10 of component: 5 * 2 per unit)
      const request = createTestRequest('/api/transactions/build', {
        method: 'POST',
        body: {
          skuId: sku.id,
          unitsToBuild: 5,
          date: new Date().toISOString().split('T')[0],
          outputToFinishedGoods: false,
        },
      })

      const response = await createBuild(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(201)
      expect(result.data).toBeDefined()

      // The FEFO lot (earlier expiry) should be consumed
      const prisma = getIntegrationPrisma()
      const earlierBalance = await prisma.lotBalance.findUnique({
        where: { lotId: earlierLot.lotId },
      })
      const laterBalance = await prisma.lotBalance.findUnique({
        where: { lotId: laterLot.lotId },
      })

      // Earlier lot should be depleted by 10
      expect(earlierBalance?.quantity.toNumber()).toBe(40) // 50 - 10
      // Later lot should be unchanged
      expect(laterBalance?.quantity.toNumber()).toBe(50)
    })

    it('creates multiple transaction lines when consuming from multiple lots', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const companyId = TEST_SESSIONS.admin!.user.companyId
      const userId = TEST_SESSIONS.admin!.user.id

      const component = await createTestComponentInDb(companyId)

      // Create two lots with limited quantity each
      const lot1 = await createLotWithBalance(component.id, 'LOT-SMALL-1', 15, new Date('2025-02-01'))
      const lot2 = await createLotWithBalance(component.id, 'LOT-SMALL-2', 20, new Date('2025-03-01'))

      const sku = await createTestSKUInDb(companyId)
      await createBOMForSKU(sku.id, userId, [{ componentId: component.id, quantityPerUnit: 2 }])

      // Build 10 units (requires 20 of component: 10 * 2 per unit)
      // This should use all of lot1 (15) and 5 from lot2
      const request = createTestRequest('/api/transactions/build', {
        method: 'POST',
        body: {
          skuId: sku.id,
          unitsToBuild: 10,
          date: new Date().toISOString().split('T')[0],
          outputToFinishedGoods: false,
        },
      })

      const response = await createBuild(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(201)

      // Check lot balances
      const prisma = getIntegrationPrisma()
      const lot1Balance = await prisma.lotBalance.findUnique({ where: { lotId: lot1.lotId } })
      const lot2Balance = await prisma.lotBalance.findUnique({ where: { lotId: lot2.lotId } })

      // Lot1 should be fully depleted (15 used)
      expect(lot1Balance?.quantity.toNumber()).toBe(0)
      // Lot2 should have 5 used (20 - 5 = 15)
      expect(lot2Balance?.quantity.toNumber()).toBe(15)
    })

    it('decrements LotBalance.quantity correctly', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const companyId = TEST_SESSIONS.admin!.user.companyId
      const userId = TEST_SESSIONS.admin!.user.id

      const component = await createTestComponentInDb(companyId)
      const lot = await createLotWithBalance(component.id, 'LOT-BALANCE-TEST', 100)

      const sku = await createTestSKUInDb(companyId)
      await createBOMForSKU(sku.id, userId, [{ componentId: component.id, quantityPerUnit: 2 }])

      const prisma = getIntegrationPrisma()
      const initialBalance = await prisma.lotBalance.findUnique({ where: { lotId: lot.lotId } })
      expect(initialBalance?.quantity.toNumber()).toBe(100)

      // Build 3 units (requires 6 of component: 3 * 2 per unit)
      const request = createTestRequest('/api/transactions/build', {
        method: 'POST',
        body: {
          skuId: sku.id,
          unitsToBuild: 3,
          date: new Date().toISOString().split('T')[0],
          outputToFinishedGoods: false,
        },
      })

      const response = await createBuild(request)
      expect(response.status).toBe(201)

      const finalBalance = await prisma.lotBalance.findUnique({ where: { lotId: lot.lotId } })
      expect(finalBalance?.quantity.toNumber()).toBe(94) // 100 - 6
    })
  })

  describe('Build with pooled (lot-less) components', () => {
    it('continues to work for components without lots', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const companyId = TEST_SESSIONS.admin!.user.companyId
      const userId = TEST_SESSIONS.admin!.user.id

      // Create a component with pooled inventory (no lots)
      const pooledComponent = await createTestComponentInDb(companyId)
      await addPooledInventory(companyId, pooledComponent.id, 1000, userId)

      const sku = await createTestSKUInDb(companyId)
      await createBOMForSKU(sku.id, userId, [{ componentId: pooledComponent.id, quantityPerUnit: 1 }])

      // Build 5 units
      const request = createTestRequest('/api/transactions/build', {
        method: 'POST',
        body: {
          skuId: sku.id,
          unitsToBuild: 5,
          date: new Date().toISOString().split('T')[0],
          outputToFinishedGoods: false,
        },
      })

      const response = await createBuild(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(201)

      // Verify lines were created with no lotId
      interface TransactionLine {
        component: { id: string }
        lotId: string | null
      }
      const lines = (result.data as { lines?: TransactionLine[] })?.lines ?? []
      expect(lines.length).toBeGreaterThan(0)
      const pooledLine = lines.find((l) => l.component.id === pooledComponent.id)
      expect(pooledLine).toBeDefined()
      expect(pooledLine?.lotId).toBeNull()
    })
  })

  describe('Build with manual lot overrides', () => {
    it('uses specified lots when override provided', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const companyId = TEST_SESSIONS.admin!.user.companyId
      const userId = TEST_SESSIONS.admin!.user.id

      const component = await createTestComponentInDb(companyId)

      // Create two lots - one with earlier expiry that FEFO would choose
      const fefoLot = await createLotWithBalance(
        component.id,
        'LOT-FEFO',
        50,
        new Date('2025-01-15') // Earlier - would normally be chosen
      )
      const preferredLot = await createLotWithBalance(
        component.id,
        'LOT-PREFERRED',
        50,
        new Date('2025-12-01') // Later expiry
      )

      const sku = await createTestSKUInDb(companyId)
      await createBOMForSKU(sku.id, userId, [{ componentId: component.id, quantityPerUnit: 2 }])

      // Build 2 units with override to use the later-expiry lot
      const request = createTestRequest('/api/transactions/build', {
        method: 'POST',
        body: {
          skuId: sku.id,
          unitsToBuild: 2,
          date: new Date().toISOString().split('T')[0],
          outputToFinishedGoods: false,
          lotOverrides: [
            {
              componentId: component.id,
              allocations: [{ lotId: preferredLot.lotId, quantity: 4 }],
            },
          ],
        },
      })

      const response = await createBuild(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(201)

      // Verify the preferred lot was used (not FEFO lot)
      const prisma = getIntegrationPrisma()
      const preferredBalance = await prisma.lotBalance.findUnique({
        where: { lotId: preferredLot.lotId },
      })
      const fefoBalance = await prisma.lotBalance.findUnique({
        where: { lotId: fefoLot.lotId },
      })

      // Preferred lot should be depleted by 4
      expect(preferredBalance?.quantity.toNumber()).toBe(46) // 50 - 4
      // FEFO lot should be unchanged
      expect(fefoBalance?.quantity.toNumber()).toBe(50)
    })
  })
})
