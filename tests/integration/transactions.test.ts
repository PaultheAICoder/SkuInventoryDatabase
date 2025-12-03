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
        where: { companyId, role: 'admin' },
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
        where: { companyId, role: 'admin' },
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
        where: { companyId, role: 'admin' },
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
        where: { companyId, role: 'admin' },
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
        where: { companyId, role: 'admin' },
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
        where: { companyId, role: 'admin' },
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
        where: { companyId, role: 'admin' },
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
  })
})
