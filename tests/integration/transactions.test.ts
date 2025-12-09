/**
 * Integration tests for Transaction Flows
 * Tests receipt, adjustment, and build transaction logic
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
} from '../helpers/integration-context'
import { disconnectTestDb } from '../helpers/db'
import { DEFAULT_SETTINGS } from '@/types/settings'

// Import route handlers directly
import { POST as createReceipt } from '@/app/api/transactions/receipt/route'
import { POST as createAdjustment } from '@/app/api/transactions/adjustment/route'
import { POST as createBuild } from '@/app/api/transactions/build/route'
import { GET as getTransactions } from '@/app/api/transactions/route'

describe('Transaction Flows', () => {
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

  describe('Receipt Transaction', () => {
    it('creates receipt with positive quantity change', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const component = await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId)

      const request = createTestRequest('/api/transactions/receipt', {
        method: 'POST',
        body: {
          componentId: component.id,
          quantity: 50,
          supplier: 'Test Supplier',
          date: new Date().toISOString().split('T')[0],
        },
      })

      const response = await createReceipt(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(201)

      // Verify quantity in database
      const prisma = getIntegrationPrisma()
      const quantity = await prisma.transactionLine.aggregate({
        where: { componentId: component.id },
        _sum: { quantityChange: true },
      })

      expect(Number(quantity._sum.quantityChange)).toBe(50)
    })

    it('receipt with cost update changes component cost', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const component = await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId)

      const request = createTestRequest('/api/transactions/receipt', {
        method: 'POST',
        body: {
          componentId: component.id,
          quantity: 100,
          supplier: 'Test Supplier',
          date: new Date().toISOString().split('T')[0],
          costPerUnit: 25.50,
          updateComponentCost: true,
        },
      })

      const response = await createReceipt(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(201)

      // Verify component cost was updated
      const prisma = getIntegrationPrisma()
      const updatedComponent = await prisma.component.findUnique({
        where: { id: component.id },
      })

      expect(Number(updatedComponent?.costPerUnit)).toBe(25.5)
    })

    it('viewer cannot create receipt (401)', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const component = await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId)

      setTestSession(TEST_SESSIONS.viewer!)

      const request = createTestRequest('/api/transactions/receipt', {
        method: 'POST',
        body: {
          componentId: component.id,
          quantity: 50,
          supplier: 'Test Supplier',
          date: new Date().toISOString().split('T')[0],
        },
      })

      const response = await createReceipt(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(401)
    })

    it('ops can create receipt', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const component = await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId)

      setTestSession(TEST_SESSIONS.ops!)

      const request = createTestRequest('/api/transactions/receipt', {
        method: 'POST',
        body: {
          componentId: component.id,
          quantity: 75,
          supplier: 'Ops Supplier',
          date: new Date().toISOString().split('T')[0],
        },
      })

      const response = await createReceipt(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(201)
    })

    it('receipt with invalid component returns 404', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      const request = createTestRequest('/api/transactions/receipt', {
        method: 'POST',
        body: {
          componentId: '00000000-0000-0000-0000-000000000000',
          quantity: 50,
          supplier: 'Test Supplier',
          date: new Date().toISOString().split('T')[0],
        },
      })

      const response = await createReceipt(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(404)
    })

    it('receipt with lot info creates Lot and LotBalance records', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const component = await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId)

      const request = createTestRequest('/api/transactions/receipt', {
        method: 'POST',
        body: {
          componentId: component.id,
          quantity: 50,
          supplier: 'Test Supplier',
          date: new Date().toISOString().split('T')[0],
          lotNumber: 'LOT-001',
          expiryDate: '2025-12-31',
        },
      })

      const response = await createReceipt(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(201)

      // Verify Lot created
      const prisma = getIntegrationPrisma()
      const lot = await prisma.lot.findFirst({
        where: { componentId: component.id, lotNumber: 'LOT-001' },
        include: { balance: true },
      })

      expect(lot).toBeDefined()
      expect(lot?.lotNumber).toBe('LOT-001')
      expect(lot?.expiryDate?.toISOString().split('T')[0]).toBe('2025-12-31')
      expect(Number(lot?.receivedQuantity)).toBe(50)
      expect(Number(lot?.balance?.quantity)).toBe(50)
    })

    it('receipt without lot info remains backward compatible', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const component = await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId)

      const request = createTestRequest('/api/transactions/receipt', {
        method: 'POST',
        body: {
          componentId: component.id,
          quantity: 25,
          supplier: 'Test Supplier',
          date: new Date().toISOString().split('T')[0],
          // No lotNumber or expiryDate
        },
      })

      const response = await createReceipt(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(201)

      // Verify no lot created
      const prisma = getIntegrationPrisma()
      const lots = await prisma.lot.findMany({
        where: { componentId: component.id },
      })

      expect(lots.length).toBe(0)
    })

    it('receipt adding to existing lot increases LotBalance', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const component = await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId)

      // First receipt creates lot
      const request1 = createTestRequest('/api/transactions/receipt', {
        method: 'POST',
        body: {
          componentId: component.id,
          quantity: 50,
          supplier: 'Supplier A',
          date: new Date().toISOString().split('T')[0],
          lotNumber: 'LOT-MULTI',
          expiryDate: '2025-12-31',
        },
      })
      await createReceipt(request1)

      // Second receipt adds to same lot
      const request2 = createTestRequest('/api/transactions/receipt', {
        method: 'POST',
        body: {
          componentId: component.id,
          quantity: 30,
          supplier: 'Supplier B',
          date: new Date().toISOString().split('T')[0],
          lotNumber: 'LOT-MULTI',
          // Note: expiryDate not provided - should not update existing
        },
      })
      const response = await createReceipt(request2)
      expect((await parseRouteResponse(response)).status).toBe(201)

      // Verify lot balance increased
      const prisma = getIntegrationPrisma()
      const lot = await prisma.lot.findFirst({
        where: { componentId: component.id, lotNumber: 'LOT-MULTI' },
        include: { balance: true },
      })

      expect(lot).toBeDefined()
      expect(Number(lot?.receivedQuantity)).toBe(80) // 50 + 30
      expect(Number(lot?.balance?.quantity)).toBe(80) // 50 + 30
    })
  })

  describe('Adjustment Transaction', () => {
    it('positive adjustment increases inventory', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const component = await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId)

      const request = createTestRequest('/api/transactions/adjustment', {
        method: 'POST',
        body: {
          componentId: component.id,
          quantity: 25,
          reason: 'Found extra inventory',
          date: new Date().toISOString().split('T')[0],
        },
      })

      const response = await createAdjustment(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(201)

      // Verify quantity in database
      const prisma = getIntegrationPrisma()
      const quantity = await prisma.transactionLine.aggregate({
        where: { componentId: component.id },
        _sum: { quantityChange: true },
      })

      expect(Number(quantity._sum.quantityChange)).toBe(25)
    })

    it('negative adjustment decreases inventory', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const component = await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId)

      // First add some inventory
      const receiptRequest = createTestRequest('/api/transactions/receipt', {
        method: 'POST',
        body: {
          componentId: component.id,
          quantity: 100,
          supplier: 'Test Supplier',
          date: new Date().toISOString().split('T')[0],
        },
      })
      await createReceipt(receiptRequest)

      // Now create negative adjustment
      const adjustmentRequest = createTestRequest('/api/transactions/adjustment', {
        method: 'POST',
        body: {
          componentId: component.id,
          quantity: -30,
          reason: 'Damaged goods',
          date: new Date().toISOString().split('T')[0],
        },
      })

      const response = await createAdjustment(adjustmentRequest)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(201)

      // Verify final quantity
      const prisma = getIntegrationPrisma()
      const quantity = await prisma.transactionLine.aggregate({
        where: { componentId: component.id },
        _sum: { quantityChange: true },
      })

      expect(Number(quantity._sum.quantityChange)).toBe(70) // 100 - 30
    })

    it('adjustment includes reason in response', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const component = await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId)

      const request = createTestRequest('/api/transactions/adjustment', {
        method: 'POST',
        body: {
          componentId: component.id,
          quantity: -10,
          reason: 'Cycle count correction',
          date: new Date().toISOString().split('T')[0],
        },
      })

      const response = await createAdjustment(request)
      const result = await parseRouteResponse<{ reason: string }>(response)

      expect(result.status).toBe(201)
      expect(result.data?.reason).toBe('Cycle count correction')
    })

    it('viewer cannot create adjustment (401)', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const component = await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId)

      setTestSession(TEST_SESSIONS.viewer!)

      const request = createTestRequest('/api/transactions/adjustment', {
        method: 'POST',
        body: {
          componentId: component.id,
          quantity: 10,
          reason: 'Test',
          date: new Date().toISOString().split('T')[0],
        },
      })

      const response = await createAdjustment(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(401)
    })
  })

  describe('Build Transaction', () => {
    it('build consumes components per BOM', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const prisma = getIntegrationPrisma()
      const companyId = TEST_SESSIONS.admin!.user.companyId

      // Create component
      const component = await createTestComponentInDb(companyId)

      // Add inventory
      const receiptRequest = createTestRequest('/api/transactions/receipt', {
        method: 'POST',
        body: {
          componentId: component.id,
          quantity: 100,
          supplier: 'Test Supplier',
          date: new Date().toISOString().split('T')[0],
        },
      })
      await createReceipt(receiptRequest)

      // Create SKU with BOM
      const sku = await createTestSKUInDb(companyId)

      const admin = await prisma.user.findFirst({
        where: { userCompanies: { some: { companyId } }, role: 'admin' },
      })

      // Create BOM version with line
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

      // Build 10 units (should consume 20 components)
      const buildRequest = createTestRequest('/api/transactions/build', {
        method: 'POST',
        body: {
          skuId: sku.id,
          bomVersionId: bomVersion.id,
          unitsToBuild: 10,
          date: new Date().toISOString().split('T')[0],
        },
      })

      const response = await createBuild(buildRequest)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(201)

      // Verify component quantity decreased
      const quantity = await prisma.transactionLine.aggregate({
        where: { componentId: component.id },
        _sum: { quantityChange: true },
      })

      expect(Number(quantity._sum.quantityChange)).toBe(80) // 100 - 20
    })

    it('build fails with insufficient inventory', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const prisma = getIntegrationPrisma()
      const companyId = TEST_SESSIONS.admin!.user.companyId

      // Create component (no inventory)
      const component = await createTestComponentInDb(companyId)

      // Create SKU with BOM
      const sku = await createTestSKUInDb(companyId)

      const admin = await prisma.user.findFirst({
        where: { userCompanies: { some: { companyId } }, role: 'admin' },
      })

      // Create BOM version with line
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
        },
      })

      const response = await createBuild(buildRequest)
      const result = await parseRouteResponse(response)

      // Should return 400 with insufficient inventory error
      expect(result.status).toBe(400)
    })

    it('build with allowInsufficientInventory proceeds', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const prisma = getIntegrationPrisma()
      const companyId = TEST_SESSIONS.admin!.user.companyId

      // Create component (no inventory)
      const component = await createTestComponentInDb(companyId)

      // Create SKU with BOM
      const sku = await createTestSKUInDb(companyId)

      const admin = await prisma.user.findFirst({
        where: { userCompanies: { some: { companyId } }, role: 'admin' },
      })

      // Create BOM version
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

      // Build with allowInsufficientInventory
      const buildRequest = createTestRequest('/api/transactions/build', {
        method: 'POST',
        body: {
          skuId: sku.id,
          bomVersionId: bomVersion.id,
          unitsToBuild: 5,
          date: new Date().toISOString().split('T')[0],
          allowInsufficientInventory: true,
        },
      })

      const response = await createBuild(buildRequest)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(201)

      // Verify negative inventory
      const quantity = await prisma.transactionLine.aggregate({
        where: { componentId: component.id },
        _sum: { quantityChange: true },
      })

      expect(Number(quantity._sum.quantityChange)).toBe(-10) // 0 - 10
    })

    it('viewer cannot create build (401)', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const prisma = getIntegrationPrisma()
      const companyId = TEST_SESSIONS.admin!.user.companyId

      const component = await createTestComponentInDb(companyId)
      const sku = await createTestSKUInDb(companyId)

      const admin = await prisma.user.findFirst({
        where: { userCompanies: { some: { companyId } }, role: 'admin' },
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

      setTestSession(TEST_SESSIONS.viewer!)

      const buildRequest = createTestRequest('/api/transactions/build', {
        method: 'POST',
        body: {
          skuId: sku.id,
          bomVersionId: bomVersion.id,
          unitsToBuild: 1,
          date: new Date().toISOString().split('T')[0],
          allowInsufficientInventory: true,
        },
      })

      const response = await createBuild(buildRequest)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(401)
    })

    it('build with current date uses date-effective BOM', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const prisma = getIntegrationPrisma()
      const companyId = TEST_SESSIONS.admin!.user.companyId

      // Create component with inventory
      const component = await createTestComponentInDb(companyId)

      const receiptRequest = createTestRequest('/api/transactions/receipt', {
        method: 'POST',
        body: {
          componentId: component.id,
          quantity: 100,
          supplier: 'Test Supplier',
          date: new Date().toISOString().split('T')[0],
        },
      })
      await createReceipt(receiptRequest)

      // Create SKU
      const sku = await createTestSKUInDb(companyId)

      const admin = await prisma.user.findFirst({
        where: { userCompanies: { some: { companyId } }, role: 'admin' },
      })

      // Create BOM version effective from today (no end date = current)
      const today = new Date()
      const bomVersion = await prisma.bOMVersion.create({
        data: {
          skuId: sku.id,
          versionName: 'v1.0-current',
          effectiveStartDate: today,
          effectiveEndDate: null,
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

      // Build with today's date
      const buildRequest = createTestRequest('/api/transactions/build', {
        method: 'POST',
        body: {
          skuId: sku.id,
          unitsToBuild: 5,
          date: today.toISOString().split('T')[0],
        },
      })

      const response = await createBuild(buildRequest)
      const result = await parseRouteResponse<{ data: { bomVersion: { id: string } } }>(response)

      expect(result.status).toBe(201)
      expect(result.data?.data?.bomVersion?.id).toBe(bomVersion.id)
    })

    it('backdated build uses BOM effective on that date', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const prisma = getIntegrationPrisma()
      const companyId = TEST_SESSIONS.admin!.user.companyId

      // Create component with inventory
      const component = await createTestComponentInDb(companyId)

      const receiptRequest = createTestRequest('/api/transactions/receipt', {
        method: 'POST',
        body: {
          componentId: component.id,
          quantity: 100,
          supplier: 'Test Supplier',
          date: new Date().toISOString().split('T')[0],
        },
      })
      await createReceipt(receiptRequest)

      // Create SKU
      const sku = await createTestSKUInDb(companyId)

      const admin = await prisma.user.findFirst({
        where: { userCompanies: { some: { companyId } }, role: 'admin' },
      })

      // Create OLD BOM version (effective 30 days ago, ended 10 days ago)
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const tenDaysAgo = new Date()
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)

      const oldBomVersion = await prisma.bOMVersion.create({
        data: {
          skuId: sku.id,
          versionName: 'v1.0-old',
          effectiveStartDate: thirtyDaysAgo,
          effectiveEndDate: tenDaysAgo,
          isActive: false,
          createdById: admin!.id,
          lines: {
            create: {
              componentId: component.id,
              quantityPerUnit: 3, // Different quantity from current
            },
          },
        },
      })

      // Create CURRENT BOM version (effective from 10 days ago, no end date)
      await prisma.bOMVersion.create({
        data: {
          skuId: sku.id,
          versionName: 'v2.0-current',
          effectiveStartDate: tenDaysAgo,
          effectiveEndDate: null,
          isActive: true,
          createdById: admin!.id,
          lines: {
            create: {
              componentId: component.id,
              quantityPerUnit: 2, // Different quantity from old
            },
          },
        },
      })

      // Build backdated to 20 days ago (should use old BOM)
      const twentyDaysAgo = new Date()
      twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20)

      const buildRequest = createTestRequest('/api/transactions/build', {
        method: 'POST',
        body: {
          skuId: sku.id,
          unitsToBuild: 5,
          date: twentyDaysAgo.toISOString().split('T')[0],
        },
      })

      const response = await createBuild(buildRequest)
      const result = await parseRouteResponse<{
        data: {
          bomVersion: { id: string }
          lines: Array<{ component: { id: string }; quantityChange: string }>
        }
      }>(response)

      expect(result.status).toBe(201)
      expect(result.data?.data?.bomVersion?.id).toBe(oldBomVersion.id)

      // Verify component consumption matches OLD BOM (3 per unit * 5 units = 15)
      const componentTx = result.data?.data?.lines?.find((l) => l.component.id === component.id)
      expect(Number(componentTx?.quantityChange)).toBe(-15) // Negative = consumed
    })

    it('build fails when no BOM covers the date', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const prisma = getIntegrationPrisma()
      const companyId = TEST_SESSIONS.admin!.user.companyId

      // Create component
      const component = await createTestComponentInDb(companyId)

      // Create SKU
      const sku = await createTestSKUInDb(companyId)

      const admin = await prisma.user.findFirst({
        where: { userCompanies: { some: { companyId } }, role: 'admin' },
      })

      // Create BOM version that starts tomorrow (not effective yet)
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)

      await prisma.bOMVersion.create({
        data: {
          skuId: sku.id,
          versionName: 'v1.0-future',
          effectiveStartDate: tomorrow,
          effectiveEndDate: null,
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

      // Try to build with today's date (should fail - BOM not yet effective)
      const buildRequest = createTestRequest('/api/transactions/build', {
        method: 'POST',
        body: {
          skuId: sku.id,
          unitsToBuild: 5,
          date: new Date().toISOString().split('T')[0],
          allowInsufficientInventory: true, // Bypass inventory check
        },
      })

      const response = await createBuild(buildRequest)
      const result = await parseRouteResponse<{ message: string }>(response)

      expect(result.status).toBe(400)
      expect(result.data?.message).toContain('No BOM version effective on')
    })

    it('build selects most recent applicable BOM when multiple match', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const prisma = getIntegrationPrisma()
      const companyId = TEST_SESSIONS.admin!.user.companyId

      // Create component with inventory
      const component = await createTestComponentInDb(companyId)

      const receiptRequest = createTestRequest('/api/transactions/receipt', {
        method: 'POST',
        body: {
          componentId: component.id,
          quantity: 100,
          supplier: 'Test Supplier',
          date: new Date().toISOString().split('T')[0],
        },
      })
      await createReceipt(receiptRequest)

      // Create SKU
      const sku = await createTestSKUInDb(companyId)

      const admin = await prisma.user.findFirst({
        where: { userCompanies: { some: { companyId } }, role: 'admin' },
      })

      // Create OLDER BOM (effective 30 days ago, no end date)
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      await prisma.bOMVersion.create({
        data: {
          skuId: sku.id,
          versionName: 'v1.0-older',
          effectiveStartDate: thirtyDaysAgo,
          effectiveEndDate: null, // Still valid
          isActive: false,
          createdById: admin!.id,
          lines: {
            create: {
              componentId: component.id,
              quantityPerUnit: 5,
            },
          },
        },
      })

      // Create NEWER BOM (effective 10 days ago, no end date)
      const tenDaysAgo = new Date()
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)

      const newerBom = await prisma.bOMVersion.create({
        data: {
          skuId: sku.id,
          versionName: 'v2.0-newer',
          effectiveStartDate: tenDaysAgo,
          effectiveEndDate: null, // Also still valid
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

      // Build with today's date - both BOMs are technically valid
      // Should select the NEWER one (more recent effectiveStartDate)
      const buildRequest = createTestRequest('/api/transactions/build', {
        method: 'POST',
        body: {
          skuId: sku.id,
          unitsToBuild: 5,
          date: new Date().toISOString().split('T')[0],
        },
      })

      const response = await createBuild(buildRequest)
      const result = await parseRouteResponse<{
        data: {
          bomVersion: { id: string }
          lines: Array<{ component: { id: string }; quantityChange: string }>
        }
      }>(response)

      expect(result.status).toBe(201)
      expect(result.data?.data?.bomVersion?.id).toBe(newerBom.id)

      // Verify consumption uses newer BOM (2 per unit, not 5)
      const componentTx = result.data?.data?.lines?.find((l) => l.component.id === component.id)
      expect(Number(componentTx?.quantityChange)).toBe(-10) // 2 * 5 = 10 consumed
    })
  })

  describe('Transaction List', () => {
    it('returns transactions for authenticated user', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const component = await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId)

      // Create a receipt
      const receiptRequest = createTestRequest('/api/transactions/receipt', {
        method: 'POST',
        body: {
          componentId: component.id,
          quantity: 50,
          supplier: 'Test Supplier',
          date: new Date().toISOString().split('T')[0],
        },
      })
      await createReceipt(receiptRequest)

      // Get transactions
      const request = createTestRequest('/api/transactions')
      const response = await getTransactions(request)
      const result = await parseRouteResponse<Array<{ type: string }>>(response)

      expect(result.status).toBe(200)
      const dataArray = Array.isArray(result.data) ? result.data : []
      expect(dataArray.length).toBeGreaterThan(0)
      expect(dataArray[0].type).toBe('receipt')
    })

    it('transaction includes createdBy info', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const component = await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId)

      // Create a receipt
      const receiptRequest = createTestRequest('/api/transactions/receipt', {
        method: 'POST',
        body: {
          componentId: component.id,
          quantity: 25,
          supplier: 'Audit Test',
          date: new Date().toISOString().split('T')[0],
        },
      })
      const receiptResponse = await createReceipt(receiptRequest)
      const receiptResult = await parseRouteResponse<{ createdBy: { id: string; name: string } }>(receiptResponse)

      expect(receiptResult.status).toBe(201)
      expect(receiptResult.data?.createdBy).toBeDefined()
      expect(receiptResult.data?.createdBy.id).toBe(TEST_SESSIONS.admin!.user.id)
    })

    it('filters transactions by salesChannel', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const prisma = getIntegrationPrisma()
      const companyId = TEST_SESSIONS.admin!.user.companyId

      // Create a component and SKU for build transactions
      const component = await createTestComponentInDb(companyId)
      const sku = await createTestSKUInDb(companyId, {
        salesChannel: 'Amazon',
      })

      const admin = await prisma.user.findFirst({
        where: { userCompanies: { some: { companyId } }, role: 'admin' },
      })

      // Create BOM version for the SKU
      await prisma.bOMVersion.create({
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

      // First add inventory via receipt
      const receiptRequest = createTestRequest('/api/transactions/receipt', {
        method: 'POST',
        body: {
          componentId: component.id,
          quantity: 100,
          supplier: 'Test',
          date: new Date().toISOString().split('T')[0],
        },
      })
      await createReceipt(receiptRequest)

      // Create a build transaction with Amazon channel
      const buildRequest = createTestRequest('/api/transactions/build', {
        method: 'POST',
        body: {
          skuId: sku.id,
          unitsToBuild: 5,
          salesChannel: 'Amazon',
          date: new Date().toISOString().split('T')[0],
        },
      })
      await createBuild(buildRequest)

      // Filter by Amazon - should find the build
      const amazonRequest = createTestRequest('/api/transactions?salesChannel=Amazon')
      const amazonResponse = await getTransactions(amazonRequest)
      const amazonResult = await parseRouteResponse<Array<{ type: string; salesChannel: string | null }>>(amazonResponse)

      expect(amazonResult.status).toBe(200)
      const amazonData = Array.isArray(amazonResult.data) ? amazonResult.data : []
      expect(amazonData.some((tx) => tx.salesChannel === 'Amazon')).toBe(true)

      // Filter by Shopify - should not find the Amazon build
      const shopifyRequest = createTestRequest('/api/transactions?salesChannel=Shopify')
      const shopifyResponse = await getTransactions(shopifyRequest)
      const shopifyResult = await parseRouteResponse<Array<{ type: string; salesChannel: string | null }>>(shopifyResponse)

      expect(shopifyResult.status).toBe(200)
      const shopifyData = Array.isArray(shopifyResult.data) ? shopifyResult.data : []
      const shopifyBuilds = shopifyData.filter((tx) => tx.type === 'build' && tx.salesChannel === 'Shopify')
      expect(shopifyBuilds.length).toBe(0)
    })
  })
})
