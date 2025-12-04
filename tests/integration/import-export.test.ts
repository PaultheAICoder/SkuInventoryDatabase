/**
 * Integration tests for Import/Export API
 * Tests CSV import and export functionality with real database
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { setTestSession, clearTestSession, TEST_SESSIONS, initializeTestSessions } from '../helpers/auth-mock'
import {
  getIntegrationPrisma,
  cleanupBeforeTest,
  createTestRequest,
  createTestComponentInDb,
  createTestSKUInDb,
} from '../helpers/integration-context'
import { disconnectTestDb } from '../helpers/db'

// Import route handlers directly
import { GET as exportComponents } from '@/app/api/export/components/route'
import { GET as exportSKUs } from '@/app/api/export/skus/route'
import { GET as exportTransactions } from '@/app/api/export/transactions/route'
import { POST as importComponents } from '@/app/api/import/components/route'
import { POST as importSKUs } from '@/app/api/import/skus/route'
import { POST as importInitialInventory } from '@/app/api/import/initial-inventory/route'
import { GET as getTemplate } from '@/app/api/import/template/[type]/route'

describe('Import/Export API', () => {
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

  describe('Export API', () => {
    describe('GET /api/export/components', () => {
      it('returns CSV with components for authenticated user', async () => {
        setTestSession(TEST_SESSIONS.admin!)

        // Create test component
        await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId)

        const response = await exportComponents(createTestRequest('/api/export/components'))

        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toBe('text/csv')

        const csv = await response.text()
        expect(csv).toContain('Name')
        expect(csv).toContain('SKU Code')
        expect(csv).toContain('Test Component')
      })

      it('returns empty CSV when no components exist', async () => {
        setTestSession(TEST_SESSIONS.admin!)

        const response = await exportComponents(createTestRequest('/api/export/components'))

        expect(response.status).toBe(200)
        const csv = await response.text()
        // Should have header row only
        expect(csv.split('\n').length).toBeLessThanOrEqual(2)
      })

      it('unauthenticated request returns 401', async () => {
        clearTestSession()

        const response = await exportComponents(createTestRequest('/api/export/components'))
        const json = await response.json()

        expect(response.status).toBe(401)
        expect(json.error).toBeDefined()
      })

      it('exported CSV includes calculated quantity', async () => {
        setTestSession(TEST_SESSIONS.admin!)

        // Create component with receipt transaction
        const component = await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId)

        const prisma = getIntegrationPrisma()
        const admin = await prisma.user.findFirst({
          where: { companyId: TEST_SESSIONS.admin!.user.companyId, role: 'admin' },
        })

        // Add inventory via transaction
        await prisma.transaction.create({
          data: {
            companyId: TEST_SESSIONS.admin!.user.companyId,
            type: 'receipt',
            date: new Date(),
            supplier: 'Test',
            createdById: admin!.id,
            lines: {
              create: {
                componentId: component.id,
                quantityChange: 100,
                costPerUnit: 10,
              },
            },
          },
        })

        const response = await exportComponents(createTestRequest('/api/export/components'))
        const csv = await response.text()

        // Should include quantity column with value
        expect(csv).toContain('Quantity On Hand')
        expect(csv).toContain('100')
      })

      it('viewer can export components', async () => {
        setTestSession(TEST_SESSIONS.viewer!)

        const response = await exportComponents(createTestRequest('/api/export/components'))

        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toBe('text/csv')
      })
    })

    describe('GET /api/export/skus', () => {
      it('returns CSV with SKUs for authenticated user', async () => {
        setTestSession(TEST_SESSIONS.admin!)

        await createTestSKUInDb(TEST_SESSIONS.admin!.user.companyId)

        const response = await exportSKUs(createTestRequest('/api/export/skus'))

        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toBe('text/csv')

        const csv = await response.text()
        expect(csv).toContain('Name')
        expect(csv).toContain('Internal Code')
        expect(csv).toContain('Test SKU')
      })

      it('unauthenticated request returns 401', async () => {
        clearTestSession()

        const response = await exportSKUs(createTestRequest('/api/export/skus'))

        expect(response.status).toBe(401)
      })
    })

    describe('GET /api/export/transactions', () => {
      it('returns CSV with transactions', async () => {
        setTestSession(TEST_SESSIONS.admin!)

        const prisma = getIntegrationPrisma()
        const component = await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId)
        const admin = await prisma.user.findFirst({
          where: { companyId: TEST_SESSIONS.admin!.user.companyId, role: 'admin' },
        })

        await prisma.transaction.create({
          data: {
            companyId: TEST_SESSIONS.admin!.user.companyId,
            type: 'receipt',
            date: new Date(),
            supplier: 'Test Supplier Export',
            createdById: admin!.id,
            lines: {
              create: {
                componentId: component.id,
                quantityChange: 50,
                costPerUnit: 10,
              },
            },
          },
        })

        const request = createTestRequest('/api/export/transactions')
        const response = await exportTransactions(request)

        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toBe('text/csv')

        const csv = await response.text()
        expect(csv).toContain('Transaction ID')
        expect(csv).toContain('receipt')
        expect(csv).toContain('Test Supplier Export')
      })

      it('unauthenticated request returns 401', async () => {
        clearTestSession()

        const request = createTestRequest('/api/export/transactions')
        const response = await exportTransactions(request)

        expect(response.status).toBe(401)
      })
    })
  })

  describe('Import API', () => {
    describe('POST /api/import/components', () => {
      it('imports valid CSV with components', async () => {
        setTestSession(TEST_SESSIONS.admin!)

        const csv = `Name,SKU Code,Category,Unit of Measure,Cost Per Unit,Reorder Point,Lead Time (Days)
Component A,COMP-001,Raw Materials,each,10.50,100,7
Component B,COMP-002,Packaging,box,5.00,50,14`

        const request = new Request('http://localhost/api/import/components', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: csv,
        })

        const response = await importComponents(request as never)
        const result = await response.json()

        expect(response.status).toBe(200)
        expect(result.data.imported).toBe(2)
        expect(result.data.total).toBe(2)
        expect(result.data.errors).toHaveLength(0)

        // Verify in database
        const prisma = getIntegrationPrisma()
        const components = await prisma.component.findMany({
          where: { skuCode: { in: ['COMP-001', 'COMP-002'] } },
        })
        expect(components).toHaveLength(2)
      })

      it('returns validation errors for invalid rows', async () => {
        setTestSession(TEST_SESSIONS.admin!)

        const csv = `Name,SKU Code,Cost Per Unit
,MISSING-NAME,10
Valid Component,VALID-001,20`

        const request = new Request('http://localhost/api/import/components', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: csv,
        })

        const response = await importComponents(request as never)
        const result = await response.json()

        expect(response.status).toBe(200)
        expect(result.data.imported).toBe(1)
        expect(result.data.skipped).toBe(1)
        expect(result.data.errors.length).toBeGreaterThan(0)
      })

      it('viewer cannot import (401)', async () => {
        setTestSession(TEST_SESSIONS.viewer!)

        const csv = 'Name,SKU Code\nTest,TEST-001'

        const request = new Request('http://localhost/api/import/components', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: csv,
        })

        const response = await importComponents(request as never)

        expect(response.status).toBe(401)
      })

      it('ops can import components', async () => {
        setTestSession(TEST_SESSIONS.ops!)

        const csv = 'Name,SKU Code\nOps Component,OPS-001'

        const request = new Request('http://localhost/api/import/components', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: csv,
        })

        const response = await importComponents(request as never)
        const result = await response.json()

        expect(response.status).toBe(200)
        expect(result.data.imported).toBe(1)
      })

      it('skips duplicate SKU codes', async () => {
        setTestSession(TEST_SESSIONS.admin!)

        // Create existing component
        await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId, {
          name: 'Existing',
          skuCode: 'DUPE-001',
        })

        const csv = 'Name,SKU Code\nDuplicate,DUPE-001'

        const request = new Request('http://localhost/api/import/components', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: csv,
        })

        const response = await importComponents(request as never)
        const result = await response.json()

        expect(response.status).toBe(200)
        expect(result.data.imported).toBe(0)
        expect(result.data.skipped).toBe(1)
      })

      it('unauthenticated request returns 401', async () => {
        clearTestSession()

        const request = new Request('http://localhost/api/import/components', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: 'Name,SKU Code\nTest,TEST-001',
        })

        const response = await importComponents(request as never)

        expect(response.status).toBe(401)
      })

      it('empty file returns 400', async () => {
        setTestSession(TEST_SESSIONS.admin!)

        const request = new Request('http://localhost/api/import/components', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: '',
        })

        const response = await importComponents(request as never)

        expect(response.status).toBe(400)
      })
    })

    describe('POST /api/import/skus', () => {
      it('imports valid CSV with SKUs', async () => {
        setTestSession(TEST_SESSIONS.admin!)

        const csv = `Name,Internal Code,Sales Channel,Notes
SKU One,SKU-INT-001,Amazon,Test note
SKU Two,SKU-INT-002,Shopify,`

        const request = new Request('http://localhost/api/import/skus', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: csv,
        })

        const response = await importSKUs(request as never)
        const result = await response.json()

        expect(response.status).toBe(200)
        expect(result.data.imported).toBe(2)
        expect(result.data.total).toBe(2)

        // Verify in database
        const prisma = getIntegrationPrisma()
        const skus = await prisma.sKU.findMany({
          where: { internalCode: { in: ['SKU-INT-001', 'SKU-INT-002'] } },
        })
        expect(skus).toHaveLength(2)
      })

      it('viewer cannot import SKUs (401)', async () => {
        setTestSession(TEST_SESSIONS.viewer!)

        const request = new Request('http://localhost/api/import/skus', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: 'Name,Internal Code,Sales Channel\nTest,TEST-001,Amazon',
        })

        const response = await importSKUs(request as never)

        expect(response.status).toBe(401)
      })

      it('unauthenticated request returns 401', async () => {
        clearTestSession()

        const request = new Request('http://localhost/api/import/skus', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: 'Name,Internal Code,Sales Channel\nTest,TEST-001,Amazon',
        })

        const response = await importSKUs(request as never)

        expect(response.status).toBe(401)
      })
    })

    describe('POST /api/import/initial-inventory', () => {
      it('imports initial inventory for components', async () => {
        setTestSession(TEST_SESSIONS.admin!)

        // Create test component - value only needed for side effect
        await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId, {
          skuCode: 'INV-001',
        })

        const csv = `Component SKU Code,Quantity,Cost Per Unit
INV-001,500,15.00`

        const request = new Request('http://localhost/api/import/initial-inventory', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: csv,
        })

        const response = await importInitialInventory(request as never)
        const result = await response.json()

        expect(response.status).toBe(200)
        expect(result.data.imported).toBe(1)

        // Verify transaction was created
        const prisma = getIntegrationPrisma()
        const transactions = await prisma.transaction.findMany({
          where: {
            companyId: TEST_SESSIONS.admin!.user.companyId,
            type: 'initial',
          },
          include: { lines: true },
        })
        expect(transactions.length).toBeGreaterThan(0)
        expect(Number(transactions[0].lines[0].quantityChange)).toBe(500)
      })

      it('skips components that already have initial inventory', async () => {
        setTestSession(TEST_SESSIONS.admin!)
        const prisma = getIntegrationPrisma()

        const component = await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId, {
          skuCode: 'ALREADY-001',
        })

        const admin = await prisma.user.findFirst({
          where: { companyId: TEST_SESSIONS.admin!.user.companyId, role: 'admin' },
        })

        // Create existing initial transaction
        await prisma.transaction.create({
          data: {
            companyId: TEST_SESSIONS.admin!.user.companyId,
            type: 'initial',
            date: new Date(),
            createdById: admin!.id,
            lines: {
              create: {
                componentId: component.id,
                quantityChange: 100,
                costPerUnit: 10,
              },
            },
          },
        })

        const csv = `Component SKU Code,Quantity,Cost Per Unit
ALREADY-001,999,20.00`

        const request = new Request('http://localhost/api/import/initial-inventory', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: csv,
        })

        const response = await importInitialInventory(request as never)
        const result = await response.json()

        expect(response.status).toBe(200)
        expect(result.data.imported).toBe(0)
        expect(result.data.skipped).toBe(1)
      })

      it('viewer cannot import initial inventory (401)', async () => {
        setTestSession(TEST_SESSIONS.viewer!)

        const request = new Request('http://localhost/api/import/initial-inventory', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: 'Component SKU Code,Quantity,Cost Per Unit\nTEST-001,100,10.00',
        })

        const response = await importInitialInventory(request as never)

        expect(response.status).toBe(401)
      })
    })

    describe('GET /api/import/template/[type]', () => {
      it('returns component template CSV', async () => {
        setTestSession(TEST_SESSIONS.admin!)

        const request = createTestRequest('/api/import/template/components')
        const response = await getTemplate(request, { params: Promise.resolve({ type: 'components' }) })

        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toBe('text/csv')

        const csv = await response.text()
        expect(csv).toContain('Name')
        expect(csv).toContain('SKU Code')
      })

      it('returns SKU template CSV', async () => {
        setTestSession(TEST_SESSIONS.admin!)

        const request = createTestRequest('/api/import/template/skus')
        const response = await getTemplate(request, { params: Promise.resolve({ type: 'skus' }) })

        expect(response.status).toBe(200)
        const csv = await response.text()
        expect(csv).toContain('Name')
        expect(csv).toContain('Internal Code')
        expect(csv).toContain('Sales Channel')
      })

      it('returns 404 for invalid template type', async () => {
        setTestSession(TEST_SESSIONS.admin!)

        const request = createTestRequest('/api/import/template/invalid')
        const response = await getTemplate(request, { params: Promise.resolve({ type: 'invalid' }) })

        expect(response.status).toBe(404)
      })

      it('unauthenticated request returns 401', async () => {
        clearTestSession()

        const request = createTestRequest('/api/import/template/components')
        const response = await getTemplate(request, { params: Promise.resolve({ type: 'components' }) })

        expect(response.status).toBe(401)
      })
    })
  })

  describe('CSV Format', () => {
    it('export handles special characters correctly', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      // Create component with special characters
      const prisma = getIntegrationPrisma()
      const brand = await prisma.brand.findFirst({
        where: { company: { id: TEST_SESSIONS.admin!.user.companyId }, isActive: true },
        orderBy: { createdAt: 'asc' },
      })
      const admin = await prisma.user.findFirst({
        where: { companyId: TEST_SESSIONS.admin!.user.companyId, role: 'admin' },
      })

      await prisma.component.create({
        data: {
          brandId: brand!.id,
          name: 'Component with "quotes" and, commas',
          skuCode: 'SPECIAL-001',
          category: 'Test',
          unitOfMeasure: 'each',
          costPerUnit: 10,
          reorderPoint: 0,
          leadTimeDays: 7,
          createdById: admin!.id,
          updatedById: admin!.id,
        },
      })

      const response = await exportComponents(createTestRequest('/api/export/components'))
      const csv = await response.text()

      // Proper CSV escaping should handle quotes and commas
      expect(response.status).toBe(200)
      expect(csv).toContain('SPECIAL-001')
    })

    it('import handles various CSV formats', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      // CSV with quoted fields and different line endings
      const csv = `"Name","SKU Code","Category"
"Component with ""quoted"" text",QUOTED-001,"Category, with comma"
Simple Component,SIMPLE-001,Simple`

      const request = new Request('http://localhost/api/import/components', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: csv,
      })

      const response = await importComponents(request as never)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.data.imported).toBe(2)
    })
  })
})
