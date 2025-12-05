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
import { POST as importInventorySnapshot } from '@/app/api/import/inventory-snapshot/route'
import { NextRequest } from 'next/server'

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

      it('component template includes reference data section', async () => {
        setTestSession(TEST_SESSIONS.admin!)

        const request = createTestRequest('/api/import/template/components')
        const response = await getTemplate(request, { params: Promise.resolve({ type: 'components' }) })

        expect(response.status).toBe(200)
        const csv = await response.text()
        expect(csv).toContain('Company')
        expect(csv).toContain('Brand')
        expect(csv).toContain('Location')
        expect(csv).toContain('# === VALID OPTIONS REFERENCE')
        expect(csv).toContain('# COMPANIES:')
        expect(csv).toContain('# BRANDS (Company -> Brand):')
      })

      it('SKU template includes reference data section', async () => {
        setTestSession(TEST_SESSIONS.admin!)

        const request = createTestRequest('/api/import/template/skus')
        const response = await getTemplate(request, { params: Promise.resolve({ type: 'skus' }) })

        expect(response.status).toBe(200)
        const csv = await response.text()
        expect(csv).toContain('Company')
        expect(csv).toContain('Brand')
        expect(csv).toContain('# === VALID OPTIONS REFERENCE')
        expect(csv).toContain('# SALES CHANNELS:')
      })
    })

    describe('Component import with company/brand lookup', () => {
      it('imports components with company and brand names', async () => {
        setTestSession(TEST_SESSIONS.admin!)
        const prisma = getIntegrationPrisma()

        // Get actual company and brand names from test session
        const company = await prisma.company.findUnique({
          where: { id: TEST_SESSIONS.admin!.user.companyId },
        })
        const brand = await prisma.brand.findFirst({
          where: { companyId: TEST_SESSIONS.admin!.user.companyId, isActive: true },
        })

        const csv = `Name,SKU Code,Company,Brand,Category
Lookup Component,LOOKUP-001,${company!.name},${brand!.name},Test Category`

        const request = new Request('http://localhost/api/import/components', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: csv,
        })

        const response = await importComponents(request as never)
        const result = await response.json()

        expect(response.status).toBe(200)
        expect(result.data.imported).toBe(1)

        // Verify component was created with correct brand
        const component = await prisma.component.findFirst({
          where: { skuCode: 'LOOKUP-001' },
        })
        expect(component).not.toBeNull()
        expect(component!.brandId).toBe(brand!.id)
      })

      it('returns clear error for invalid company name', async () => {
        setTestSession(TEST_SESSIONS.admin!)

        const csv = `Name,SKU Code,Company,Brand,Category
Bad Company Component,BADCO-001,Nonexistent Company,Some Brand,Electronics`

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
        expect(result.data.errors[0].errors[0]).toContain('Company "Nonexistent Company" not found')
      })

      it('returns clear error for invalid brand name', async () => {
        setTestSession(TEST_SESSIONS.admin!)
        const prisma = getIntegrationPrisma()

        const company = await prisma.company.findUnique({
          where: { id: TEST_SESSIONS.admin!.user.companyId },
        })

        const csv = `Name,SKU Code,Company,Brand,Category
Bad Brand Component,BADBR-001,${company!.name},Nonexistent Brand,Electronics`

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
        expect(result.data.errors[0].errors[0]).toContain('Brand "Nonexistent Brand" not found')
      })

      it('uses session defaults when company/brand not specified', async () => {
        setTestSession(TEST_SESSIONS.admin!)
        const prisma = getIntegrationPrisma()

        const csv = `Name,SKU Code,Category
Default Company Component,DEFCO-001,Electronics`

        const request = new Request('http://localhost/api/import/components', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: csv,
        })

        const response = await importComponents(request as never)
        const result = await response.json()

        expect(response.status).toBe(200)
        expect(result.data.imported).toBe(1)

        // Verify component was created with session's company
        const component = await prisma.component.findFirst({
          where: { skuCode: 'DEFCO-001' },
        })
        expect(component).not.toBeNull()
        expect(component!.companyId).toBe(TEST_SESSIONS.admin!.user.companyId)
      })
    })

    describe('SKU import with company/brand lookup', () => {
      it('imports SKUs with company and brand names', async () => {
        setTestSession(TEST_SESSIONS.admin!)
        const prisma = getIntegrationPrisma()

        // Get actual company and brand names from test session
        const company = await prisma.company.findUnique({
          where: { id: TEST_SESSIONS.admin!.user.companyId },
        })
        const brand = await prisma.brand.findFirst({
          where: { companyId: TEST_SESSIONS.admin!.user.companyId, isActive: true },
        })

        const csv = `Name,Internal Code,Company,Brand,Sales Channel
Lookup SKU,LOOKUP-SKU-001,${company!.name},${brand!.name},Amazon`

        const request = new Request('http://localhost/api/import/skus', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: csv,
        })

        const response = await importSKUs(request as never)
        const result = await response.json()

        expect(response.status).toBe(200)
        expect(result.data.imported).toBe(1)

        // Verify SKU was created with correct brand
        const sku = await prisma.sKU.findFirst({
          where: { internalCode: 'LOOKUP-SKU-001' },
        })
        expect(sku).not.toBeNull()
        expect(sku!.brandId).toBe(brand!.id)
      })

      it('returns clear error for invalid company name in SKU import', async () => {
        setTestSession(TEST_SESSIONS.admin!)

        const csv = `Name,Internal Code,Company,Brand,Sales Channel
Bad Company SKU,BADCO-SKU-001,Nonexistent Company,Some Brand,Amazon`

        const request = new Request('http://localhost/api/import/skus', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: csv,
        })

        const response = await importSKUs(request as never)
        const result = await response.json()

        expect(response.status).toBe(200)
        expect(result.data.imported).toBe(0)
        expect(result.data.skipped).toBe(1)
        expect(result.data.errors[0].errors[0]).toContain('Company "Nonexistent Company" not found')
      })
    })
  })

  describe('SKU Import with BOM', () => {
    it('imports SKU and creates BOM version with components', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const prisma = getIntegrationPrisma()

      // Create test components first
      const component1 = await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId, {
        name: 'Box Component',
        skuCode: 'BOX-INT-001',
      })
      const component2 = await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId, {
        name: 'Label Component',
        skuCode: 'LABEL-INT-001',
      })

      const csv = `Name,Internal Code,Sales Channel,BOM Component 1,BOM Qty 1,BOM Component 2,BOM Qty 2
SKU With BOM,SKU-BOM-001,Amazon,BOX-INT-001,2,LABEL-INT-001,1`

      const request = new Request('http://localhost/api/import/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: csv,
      })

      const response = await importSKUs(request as never)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.data.imported).toBe(1)

      // Verify SKU was created
      const sku = await prisma.sKU.findFirst({
        where: { internalCode: 'SKU-BOM-001' },
      })
      expect(sku).not.toBeNull()

      // Verify BOM version was created
      const bomVersion = await prisma.bOMVersion.findFirst({
        where: { skuId: sku!.id, isActive: true },
        include: { lines: true },
      })
      expect(bomVersion).not.toBeNull()
      expect(bomVersion!.lines).toHaveLength(2)

      // Verify component quantities
      const boxLine = bomVersion!.lines.find((l) => l.componentId === component1.id)
      const labelLine = bomVersion!.lines.find((l) => l.componentId === component2.id)
      expect(Number(boxLine!.quantityPerUnit)).toBe(2)
      expect(Number(labelLine!.quantityPerUnit)).toBe(1)
    })

    it('imports SKU but reports error for invalid BOM component', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const prisma = getIntegrationPrisma()

      const csv = `Name,Internal Code,Sales Channel,BOM Component 1,BOM Qty 1
SKU Bad BOM,SKU-BADBOM-001,Amazon,NONEXISTENT-COMP,1`

      const request = new Request('http://localhost/api/import/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: csv,
      })

      const response = await importSKUs(request as never)
      const result = await response.json()

      expect(response.status).toBe(200)
      // SKU should still be created, but with an error note about BOM
      expect(result.data.imported).toBe(1)
      expect(result.data.errors[0].errors[0]).toContain('BOM component "NONEXISTENT-COMP" not found')

      // Verify SKU was created (without BOM)
      const sku = await prisma.sKU.findFirst({
        where: { internalCode: 'SKU-BADBOM-001' },
      })
      expect(sku).not.toBeNull()

      // Verify no BOM was created
      const bomVersion = await prisma.bOMVersion.findFirst({
        where: { skuId: sku!.id },
      })
      expect(bomVersion).toBeNull()
    })

    it('template includes component reference for SKUs', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      // Create test component
      await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId, {
        name: 'Ref Component',
        skuCode: 'REF-COMP-001',
      })

      const request = createTestRequest('/api/import/template/skus')
      const response = await getTemplate(request, { params: Promise.resolve({ type: 'skus' }) })

      expect(response.status).toBe(200)
      const csv = await response.text()

      expect(csv).toContain('BOM Component 1')
      expect(csv).toContain('BOM Qty 1')
      expect(csv).toContain('# COMPONENTS (SKU Code -> Name [Cost])')
      expect(csv).toContain('REF-COMP-001')
    })

    it('imports SKU without BOM when BOM columns are empty', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const prisma = getIntegrationPrisma()

      const csv = `Name,Internal Code,Sales Channel,BOM Component 1,BOM Qty 1
SKU No BOM,SKU-NOBOM-001,Amazon,,`

      const request = new Request('http://localhost/api/import/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: csv,
      })

      const response = await importSKUs(request as never)
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(result.data.imported).toBe(1)
      expect(result.data.errors).toHaveLength(0)

      // Verify SKU was created without BOM
      const sku = await prisma.sKU.findFirst({
        where: { internalCode: 'SKU-NOBOM-001' },
      })
      expect(sku).not.toBeNull()

      const bomVersion = await prisma.bOMVersion.findFirst({
        where: { skuId: sku!.id },
      })
      expect(bomVersion).toBeNull()
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
          companyId: TEST_SESSIONS.admin!.user.companyId,
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

  describe('Inventory Snapshot Import', () => {
    describe('POST /api/import/inventory-snapshot', () => {
      it('creates components with correct companyId (issue #174)', async () => {
        setTestSession(TEST_SESSIONS.admin!)
        const prisma = getIntegrationPrisma()

        // Generate a unique SKU code for this test
        const uniqueName = `Test Import Component ${Date.now()}`

        // Create a minimal XLSX buffer with test data
        const XLSX = await import('xlsx')
        const workbook = XLSX.utils.book_new()
        const worksheet = XLSX.utils.aoa_to_sheet([
          ['Item Name', 'Current Balance'],
          [uniqueName, 100],
        ])
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1')
        const xlsxBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

        // Create FormData with the file
        const formData = new FormData()
        const file = new File([xlsxBuffer], 'test-snapshot.xlsx', {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
        formData.append('file', file)

        // Create request with FormData
        const url = new URL('/api/import/inventory-snapshot', 'http://localhost:4500')
        const request = new NextRequest(url, {
          method: 'POST',
          body: formData,
        })

        const response = await importInventorySnapshot(request)
        expect(response.status).toBe(200)

        const json = await response.json()
        expect(json.data.componentsCreated).toBeGreaterThan(0)

        // Verify the created component has the correct companyId
        const createdComponent = await prisma.component.findFirst({
          where: {
            name: uniqueName,
          },
        })

        expect(createdComponent).not.toBeNull()
        expect(createdComponent!.companyId).toBe(TEST_SESSIONS.admin!.user.companyId)
      })

      it('viewer cannot import inventory snapshot (401)', async () => {
        setTestSession(TEST_SESSIONS.viewer!)

        const XLSX = await import('xlsx')
        const workbook = XLSX.utils.book_new()
        const worksheet = XLSX.utils.aoa_to_sheet([
          ['Item Name', 'Current Balance'],
          ['Test Component', 100],
        ])
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1')
        const xlsxBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

        const formData = new FormData()
        const file = new File([xlsxBuffer], 'test-snapshot.xlsx', {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
        formData.append('file', file)

        const url = new URL('/api/import/inventory-snapshot', 'http://localhost:4500')
        const request = new NextRequest(url, {
          method: 'POST',
          body: formData,
        })

        const response = await importInventorySnapshot(request)
        expect(response.status).toBe(401)
      })
    })
  })
})
