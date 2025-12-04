/**
 * Integration tests for Location-Aware Transactions
 * Tests that transactions correctly handle location-specific inventory
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { setTestSession, clearTestSession, TEST_SESSIONS, initializeTestSessions } from '../helpers/auth-mock'
import {
  getIntegrationPrisma,
  cleanupBeforeTest,
  createTestRequest,
  parseRouteResponse,
  createTestComponentInDb,
  createTestSKUInDb,
  createTestLocationInDb,
  getOrCreateDefaultLocation,
} from '../helpers/integration-context'
import { disconnectTestDb } from '../helpers/db'
import { DEFAULT_SETTINGS } from '@/types/settings'

// Import route handlers
import { POST as createReceipt } from '@/app/api/transactions/receipt/route'
import { POST as createAdjustment } from '@/app/api/transactions/adjustment/route'
import { POST as createBuild } from '@/app/api/transactions/build/route'
import { POST as createTransfer } from '@/app/api/transactions/transfer/route'

describe('Location-Aware Transactions', () => {
  beforeAll(async () => {
    const prisma = getIntegrationPrisma()
    await initializeTestSessions(prisma)
  })

  beforeEach(async () => {
    await cleanupBeforeTest()
    clearTestSession()

    // Reset company settings to defaults to ensure consistent test state
    const prisma = getIntegrationPrisma()
    await prisma.company.update({
      where: { id: TEST_SESSIONS.admin!.user.companyId },
      data: { settings: DEFAULT_SETTINGS },
    })
  })

  afterAll(async () => {
    await disconnectTestDb()
  })

  describe('Receipt to specific location', () => {
    it('increases inventory at specified location only', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const prisma = getIntegrationPrisma()
      const companyId = TEST_SESSIONS.admin!.user.companyId

      // Create two locations
      const defaultLocation = await getOrCreateDefaultLocation(companyId)
      const secondLocation = await createTestLocationInDb(companyId, {
        name: 'Secondary Warehouse',
        type: 'warehouse',
      })

      // Create component
      const component = await createTestComponentInDb(companyId)

      // Receipt to second location
      const request = createTestRequest('/api/transactions/receipt', {
        method: 'POST',
        body: {
          componentId: component.id,
          quantity: 100,
          supplier: 'Test Supplier',
          date: new Date().toISOString().split('T')[0],
          locationId: secondLocation.id,
        },
      })

      const response = await createReceipt(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(201)

      // Verify inventory at second location
      const secondLocationQty = await prisma.transactionLine.aggregate({
        where: {
          componentId: component.id,
          transaction: { locationId: secondLocation.id },
        },
        _sum: { quantityChange: true },
      })
      expect(Number(secondLocationQty._sum.quantityChange)).toBe(100)

      // Verify no inventory at default location
      const defaultLocationQty = await prisma.transactionLine.aggregate({
        where: {
          componentId: component.id,
          transaction: { locationId: defaultLocation.id },
        },
        _sum: { quantityChange: true },
      })
      expect(defaultLocationQty._sum.quantityChange).toBeNull()
    })

    it('uses default location when none specified', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const prisma = getIntegrationPrisma()
      const companyId = TEST_SESSIONS.admin!.user.companyId

      const defaultLocation = await getOrCreateDefaultLocation(companyId)
      const component = await createTestComponentInDb(companyId)

      // Receipt without locationId
      const request = createTestRequest('/api/transactions/receipt', {
        method: 'POST',
        body: {
          componentId: component.id,
          quantity: 50,
          supplier: 'Test Supplier',
          date: new Date().toISOString().split('T')[0],
          // No locationId specified
        },
      })

      const response = await createReceipt(request)
      const result = await parseRouteResponse<{ locationId: string }>(response)

      expect(result.status).toBe(201)
      expect(result.data?.locationId).toBe(defaultLocation.id)

      // Verify transaction is at default location
      const transaction = await prisma.transaction.findFirst({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
      })
      expect(transaction?.locationId).toBe(defaultLocation.id)
    })
  })

  describe('Adjustment at location', () => {
    it('only affects specified location inventory', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const prisma = getIntegrationPrisma()
      const companyId = TEST_SESSIONS.admin!.user.companyId

      // Setup: Two locations with inventory
      const loc1 = await getOrCreateDefaultLocation(companyId)
      const loc2 = await createTestLocationInDb(companyId, { name: 'Warehouse B' })
      const component = await createTestComponentInDb(companyId)

      // Add 100 to each location
      await createReceipt(
        createTestRequest('/api/transactions/receipt', {
          method: 'POST',
          body: {
            componentId: component.id,
            quantity: 100,
            supplier: 'Test',
            date: new Date().toISOString().split('T')[0],
            locationId: loc1.id,
          },
        })
      )
      await createReceipt(
        createTestRequest('/api/transactions/receipt', {
          method: 'POST',
          body: {
            componentId: component.id,
            quantity: 100,
            supplier: 'Test',
            date: new Date().toISOString().split('T')[0],
            locationId: loc2.id,
          },
        })
      )

      // Adjust -30 at loc1 only
      const adjustRequest = createTestRequest('/api/transactions/adjustment', {
        method: 'POST',
        body: {
          componentId: component.id,
          quantity: -30,
          reason: 'Damaged goods',
          date: new Date().toISOString().split('T')[0],
          locationId: loc1.id,
        },
      })

      const adjustResponse = await createAdjustment(adjustRequest)
      expect((await parseRouteResponse(adjustResponse)).status).toBe(201)

      // Verify loc1 has 70, loc2 has 100
      const loc1Qty = await prisma.transactionLine.aggregate({
        where: {
          componentId: component.id,
          transaction: { locationId: loc1.id },
        },
        _sum: { quantityChange: true },
      })
      expect(Number(loc1Qty._sum.quantityChange)).toBe(70) // 100 - 30

      const loc2Qty = await prisma.transactionLine.aggregate({
        where: {
          componentId: component.id,
          transaction: { locationId: loc2.id },
        },
        _sum: { quantityChange: true },
      })
      expect(Number(loc2Qty._sum.quantityChange)).toBe(100) // unchanged
    })
  })

  describe('Build with location', () => {
    it('consumes from specified location', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const prisma = getIntegrationPrisma()
      const companyId = TEST_SESSIONS.admin!.user.companyId

      // Setup: Component with inventory at specific location
      const location = await getOrCreateDefaultLocation(companyId)
      const component = await createTestComponentInDb(companyId)

      // Add inventory at location
      await createReceipt(
        createTestRequest('/api/transactions/receipt', {
          method: 'POST',
          body: {
            componentId: component.id,
            quantity: 100,
            supplier: 'Test',
            date: new Date().toISOString().split('T')[0],
            locationId: location.id,
          },
        })
      )

      // Create SKU with BOM
      const sku = await createTestSKUInDb(companyId)
      const admin = await prisma.user.findFirst({
        where: { companyId, role: 'admin' },
      })
      const bomVersion = await prisma.bOMVersion.create({
        data: {
          skuId: sku.id,
          versionName: 'v1.0',
          effectiveStartDate: new Date(),
          isActive: true,
          createdById: admin!.id,
          lines: {
            create: {
              componentId: component.id,
              quantityPerUnit: 2,
            },
          },
        },
      })

      // Build 10 units at location
      const buildRequest = createTestRequest('/api/transactions/build', {
        method: 'POST',
        body: {
          skuId: sku.id,
          bomVersionId: bomVersion.id,
          unitsToBuild: 10,
          date: new Date().toISOString().split('T')[0],
          locationId: location.id,
        },
      })

      const buildResponse = await createBuild(buildRequest)
      const buildResult = await parseRouteResponse(buildResponse)

      expect(buildResult.status).toBe(201)

      // Verify consumption: 100 - (10 * 2) = 80
      const locationQty = await prisma.transactionLine.aggregate({
        where: {
          componentId: component.id,
          transaction: { locationId: location.id },
        },
        _sum: { quantityChange: true },
      })
      expect(Number(locationQty._sum.quantityChange)).toBe(80)
    })

    it('outputs finished goods to output location', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const prisma = getIntegrationPrisma()
      const companyId = TEST_SESSIONS.admin!.user.companyId

      // Setup: Locations
      const consumeLocation = await getOrCreateDefaultLocation(companyId)
      const outputLocation = await createTestLocationInDb(companyId, {
        name: 'Finished Goods Storage',
        type: 'finished_goods',
      })

      // Setup: Component with inventory
      const component = await createTestComponentInDb(companyId)
      await createReceipt(
        createTestRequest('/api/transactions/receipt', {
          method: 'POST',
          body: {
            componentId: component.id,
            quantity: 100,
            supplier: 'Test',
            date: new Date().toISOString().split('T')[0],
            locationId: consumeLocation.id,
          },
        })
      )

      // Create SKU with BOM
      const sku = await createTestSKUInDb(companyId)
      const admin = await prisma.user.findFirst({
        where: { companyId, role: 'admin' },
      })
      const bomVersion = await prisma.bOMVersion.create({
        data: {
          skuId: sku.id,
          versionName: 'v1.0',
          effectiveStartDate: new Date(),
          isActive: true,
          createdById: admin!.id,
          lines: {
            create: {
              componentId: component.id,
              quantityPerUnit: 1,
            },
          },
        },
      })

      // Build with output location
      const buildRequest = createTestRequest('/api/transactions/build', {
        method: 'POST',
        body: {
          skuId: sku.id,
          bomVersionId: bomVersion.id,
          unitsToBuild: 10,
          date: new Date().toISOString().split('T')[0],
          locationId: consumeLocation.id,
          outputLocationId: outputLocation.id,
          outputQuantity: 10,
        },
      })

      const buildResponse = await createBuild(buildRequest)
      expect((await parseRouteResponse(buildResponse)).status).toBe(201)

      // Verify finished goods at output location
      const finishedGoods = await prisma.finishedGoodsLine.findFirst({
        where: {
          skuId: sku.id,
          locationId: outputLocation.id,
        },
      })
      expect(finishedGoods).not.toBeNull()
      expect(Number(finishedGoods?.quantityChange)).toBe(10)
    })

    it('blocks when insufficient at location unless override', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const prisma = getIntegrationPrisma()
      const companyId = TEST_SESSIONS.admin!.user.companyId

      // Setup: Component with NO inventory at location
      const location = await getOrCreateDefaultLocation(companyId)
      const component = await createTestComponentInDb(companyId)

      // Create SKU with BOM
      const sku = await createTestSKUInDb(companyId)
      const admin = await prisma.user.findFirst({
        where: { companyId, role: 'admin' },
      })
      const bomVersion = await prisma.bOMVersion.create({
        data: {
          skuId: sku.id,
          versionName: 'v1.0',
          effectiveStartDate: new Date(),
          isActive: true,
          createdById: admin!.id,
          lines: {
            create: {
              componentId: component.id,
              quantityPerUnit: 5,
            },
          },
        },
      })

      // Try to build (should fail - no inventory)
      const buildRequest = createTestRequest('/api/transactions/build', {
        method: 'POST',
        body: {
          skuId: sku.id,
          bomVersionId: bomVersion.id,
          unitsToBuild: 10,
          date: new Date().toISOString().split('T')[0],
          locationId: location.id,
        },
      })

      const buildResponse = await createBuild(buildRequest)
      const buildResult = await parseRouteResponse(buildResponse)

      expect(buildResult.status).toBe(400)

      // With override, should succeed
      const overrideRequest = createTestRequest('/api/transactions/build', {
        method: 'POST',
        body: {
          skuId: sku.id,
          bomVersionId: bomVersion.id,
          unitsToBuild: 10,
          date: new Date().toISOString().split('T')[0],
          locationId: location.id,
          allowInsufficientInventory: true,
        },
      })

      const overrideResponse = await createBuild(overrideRequest)
      expect((await parseRouteResponse(overrideResponse)).status).toBe(201)
    })
  })

  describe('Transfer between locations', () => {
    it('decreases source and increases destination atomically', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const prisma = getIntegrationPrisma()
      const companyId = TEST_SESSIONS.admin!.user.companyId

      // Setup: Component with inventory at source
      const sourceLocation = await getOrCreateDefaultLocation(companyId)
      const destLocation = await createTestLocationInDb(companyId, {
        name: 'Destination Warehouse',
      })
      const component = await createTestComponentInDb(companyId)

      // Add 100 at source
      await createReceipt(
        createTestRequest('/api/transactions/receipt', {
          method: 'POST',
          body: {
            componentId: component.id,
            quantity: 100,
            supplier: 'Test',
            date: new Date().toISOString().split('T')[0],
            locationId: sourceLocation.id,
          },
        })
      )

      // Transfer 30 from source to destination
      const transferRequest = createTestRequest('/api/transactions/transfer', {
        method: 'POST',
        body: {
          componentId: component.id,
          quantity: 30,
          fromLocationId: sourceLocation.id,
          toLocationId: destLocation.id,
          date: new Date().toISOString().split('T')[0],
        },
      })

      const transferResponse = await createTransfer(transferRequest)
      const transferResult = await parseRouteResponse(transferResponse)

      expect(transferResult.status).toBe(201)

      // Verify transfer transaction exists with both locations
      const transfer = await prisma.transaction.findFirst({
        where: { type: 'transfer', companyId },
        include: { lines: true },
      })

      expect(transfer).not.toBeNull()
      expect(transfer?.fromLocationId).toBe(sourceLocation.id)
      expect(transfer?.toLocationId).toBe(destLocation.id)
      expect(transfer?.lines).toHaveLength(2)

      // One negative line (-30) and one positive line (+30)
      const negLine = transfer?.lines.find((l) => Number(l.quantityChange) < 0)
      const posLine = transfer?.lines.find((l) => Number(l.quantityChange) > 0)
      expect(Number(negLine?.quantityChange)).toBe(-30)
      expect(Number(posLine?.quantityChange)).toBe(30)
    })

    it('rejects transfer exceeding available quantity', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const companyId = TEST_SESSIONS.admin!.user.companyId

      const sourceLocation = await getOrCreateDefaultLocation(companyId)
      const destLocation = await createTestLocationInDb(companyId, {
        name: 'Destination',
      })
      const component = await createTestComponentInDb(companyId)

      // Add only 50 at source
      await createReceipt(
        createTestRequest('/api/transactions/receipt', {
          method: 'POST',
          body: {
            componentId: component.id,
            quantity: 50,
            supplier: 'Test',
            date: new Date().toISOString().split('T')[0],
            locationId: sourceLocation.id,
          },
        })
      )

      // Try to transfer 100 (should fail)
      const transferRequest = createTestRequest('/api/transactions/transfer', {
        method: 'POST',
        body: {
          componentId: component.id,
          quantity: 100,
          fromLocationId: sourceLocation.id,
          toLocationId: destLocation.id,
          date: new Date().toISOString().split('T')[0],
        },
      })

      const transferResponse = await createTransfer(transferRequest)
      const transferResult = await parseRouteResponse<{ message: string }>(transferResponse)

      expect(transferResult.status).toBe(400)
      // Error message is in the response body
      expect(transferResult.data?.message || transferResult.error).toMatch(/Insufficient inventory|BadRequest/)
    })

    it('rejects transfer to same location', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const companyId = TEST_SESSIONS.admin!.user.companyId

      const location = await getOrCreateDefaultLocation(companyId)
      const component = await createTestComponentInDb(companyId)

      // Add inventory
      await createReceipt(
        createTestRequest('/api/transactions/receipt', {
          method: 'POST',
          body: {
            componentId: component.id,
            quantity: 100,
            supplier: 'Test',
            date: new Date().toISOString().split('T')[0],
            locationId: location.id,
          },
        })
      )

      // Try to transfer to same location
      const transferRequest = createTestRequest('/api/transactions/transfer', {
        method: 'POST',
        body: {
          componentId: component.id,
          quantity: 30,
          fromLocationId: location.id,
          toLocationId: location.id, // Same location
          date: new Date().toISOString().split('T')[0],
        },
      })

      const transferResponse = await createTransfer(transferRequest)
      const transferResult = await parseRouteResponse<{ message: string }>(transferResponse)

      expect(transferResult.status).toBe(400)
      // Error message is in the response body
      expect(transferResult.data?.message || transferResult.error).toMatch(/same location|BadRequest/)
    })

    it('appears correctly in transaction history', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const prisma = getIntegrationPrisma()
      const companyId = TEST_SESSIONS.admin!.user.companyId

      const sourceLocation = await getOrCreateDefaultLocation(companyId)
      const destLocation = await createTestLocationInDb(companyId, {
        name: 'Dest Warehouse',
      })
      const component = await createTestComponentInDb(companyId)

      // Add inventory and transfer
      await createReceipt(
        createTestRequest('/api/transactions/receipt', {
          method: 'POST',
          body: {
            componentId: component.id,
            quantity: 100,
            supplier: 'Test',
            date: new Date().toISOString().split('T')[0],
            locationId: sourceLocation.id,
          },
        })
      )

      await createTransfer(
        createTestRequest('/api/transactions/transfer', {
          method: 'POST',
          body: {
            componentId: component.id,
            quantity: 25,
            fromLocationId: sourceLocation.id,
            toLocationId: destLocation.id,
            date: new Date().toISOString().split('T')[0],
            notes: 'Test transfer',
          },
        })
      )

      // Fetch all transactions
      const transactions = await prisma.transaction.findMany({
        where: { companyId },
        include: {
          fromLocation: true,
          toLocation: true,
        },
        orderBy: { createdAt: 'desc' },
      })

      // Should have receipt and transfer
      expect(transactions).toHaveLength(2)

      const transfer = transactions.find((t) => t.type === 'transfer')
      expect(transfer).toBeDefined()
      expect(transfer?.fromLocation?.name).toBe('Main Warehouse')
      expect(transfer?.toLocation?.name).toBe('Dest Warehouse')
      expect(transfer?.notes).toBe('Test transfer')
    })
  })
})
