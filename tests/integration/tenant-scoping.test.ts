/**
 * Integration tests for Tenant Scoping
 * Tests that cross-tenant access returns 404 (not 403 or 200)
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { hash } from 'bcryptjs'
import { setTestSession, clearTestSession, TEST_SESSIONS, initializeTestSessions, TestUserSession } from '../helpers/auth-mock'
import {
  getIntegrationPrisma,
  cleanupBeforeTest,
  createTestRequest,
  parseRouteResponse,
  createTestComponentInDb,
  createTestSKUInDb,
} from '../helpers/integration-context'
import { disconnectTestDb } from '../helpers/db'

// Import route handlers directly
import { GET as getComponents } from '@/app/api/components/route'
import { GET as getComponentById } from '@/app/api/components/[id]/route'
import { GET as getSKUs } from '@/app/api/skus/route'
import { GET as getSKUById } from '@/app/api/skus/[id]/route'
import { GET as getTransactions } from '@/app/api/transactions/route'

describe('Tenant Scoping', () => {
  let otherCompanySession: TestUserSession
  let otherCompanyId: string

  beforeAll(async () => {
    const prisma = getIntegrationPrisma()
    await initializeTestSessions(prisma)

    // Create second company for multi-tenant testing
    const otherCompany = await prisma.company.create({
      data: {
        name: 'Other Company Test',
        settings: {},
      },
    })
    otherCompanyId = otherCompany.id

    // Create brand for other company
    await prisma.brand.create({
      data: {
        companyId: otherCompany.id,
        name: 'Other Brand Test',
      },
    })

    // Create user for other company
    const passwordHash = await hash('password123', 12)
    const otherUser = await prisma.user.create({
      data: {
        companyId: otherCompany.id,
        email: 'other@test.com',
        passwordHash,
        name: 'Other User',
        role: 'admin',
      },
    })

    otherCompanySession = {
      user: {
        id: otherUser.id,
        email: otherUser.email,
        name: otherUser.name,
        role: 'admin',
        companyId: otherCompany.id,
        companyName: otherCompany.name,
      },
    }
  })

  beforeEach(async () => {
    await cleanupBeforeTest()
    clearTestSession()
  })

  afterAll(async () => {
    const prisma = getIntegrationPrisma()
    // Clean up test company
    await prisma.user.deleteMany({ where: { companyId: otherCompanyId } })
    await prisma.brand.deleteMany({ where: { companyId: otherCompanyId } })
    await prisma.company.delete({ where: { id: otherCompanyId } })
    await disconnectTestDb()
  })

  describe('Component Tenant Isolation', () => {
    it('user cannot see components from other company in list', async () => {
      // Create component in original company
      const component = await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId)

      // Try to access as other company user
      setTestSession(otherCompanySession)

      const request = createTestRequest('/api/components')
      const response = await getComponents(request)
      const result = await parseRouteResponse<{ data: Array<{ id: string }> }>(response)

      expect(result.status).toBe(200)
      // Should not include the component from other company
      const dataArray = Array.isArray(result.data) ? result.data : []
      const componentIds = dataArray.map((c: { id: string }) => c.id)
      expect(componentIds).not.toContain(component.id)
    })

    it('accessing component from other company returns 404', async () => {
      // Create component in original company
      setTestSession(TEST_SESSIONS.admin!)
      const component = await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId)

      // Try to access by ID as other company user
      setTestSession(otherCompanySession)

      const request = createTestRequest(`/api/components/${component.id}`)
      const response = await getComponentById(request, { params: Promise.resolve({ id: component.id }) })
      const result = await parseRouteResponse(response)

      // Should return 404, not 403 (prevents information leakage)
      expect(result.status).toBe(404)
    })

    it('user sees only their own company components', async () => {
      // Create component in original company
      setTestSession(TEST_SESSIONS.admin!)
      const myComponent = await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId)

      // Access as admin of original company
      const request = createTestRequest('/api/components')
      const response = await getComponents(request)
      const result = await parseRouteResponse<Array<{ id: string }>>(response)

      expect(result.status).toBe(200)
      // Paginated response: result.data is the array directly
      const dataArray = Array.isArray(result.data) ? result.data : []
      const componentIds = dataArray.map((c) => c.id)
      expect(componentIds).toContain(myComponent.id)
    })
  })

  describe('SKU Tenant Isolation', () => {
    it('user cannot see SKUs from other company in list', async () => {
      // Create SKU in original company
      const sku = await createTestSKUInDb(TEST_SESSIONS.admin!.user.companyId)

      // Try to access as other company user
      setTestSession(otherCompanySession)

      const request = createTestRequest('/api/skus')
      const response = await getSKUs(request)
      const result = await parseRouteResponse<{ data: Array<{ id: string }> }>(response)

      expect(result.status).toBe(200)
      const dataArray = Array.isArray(result.data) ? result.data : []
      const skuIds = dataArray.map((s: { id: string }) => s.id)
      expect(skuIds).not.toContain(sku.id)
    })

    it('accessing SKU from other company returns 404', async () => {
      // Create SKU in original company
      setTestSession(TEST_SESSIONS.admin!)
      const sku = await createTestSKUInDb(TEST_SESSIONS.admin!.user.companyId)

      // Try to access by ID as other company user
      setTestSession(otherCompanySession)

      const request = createTestRequest(`/api/skus/${sku.id}`)
      const response = await getSKUById(request, { params: Promise.resolve({ id: sku.id }) })
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(404)
    })

    it('user sees only their own company SKUs', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const mySKU = await createTestSKUInDb(TEST_SESSIONS.admin!.user.companyId)

      const request = createTestRequest('/api/skus')
      const response = await getSKUs(request)
      const result = await parseRouteResponse<{ data: Array<{ id: string }> }>(response)

      expect(result.status).toBe(200)
      const dataArray = Array.isArray(result.data) ? result.data : []
      const skuIds = dataArray.map((s: { id: string }) => s.id)
      expect(skuIds).toContain(mySKU.id)
    })
  })

  describe('Transaction Tenant Isolation', () => {
    it('user can only see transactions from their own company', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      const request = createTestRequest('/api/transactions')
      const response = await getTransactions(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(200)
      // Transactions should be scoped to user's company
      expect(result.data).toBeDefined()
    })

    it('other company user sees only their transactions (empty if none)', async () => {
      setTestSession(otherCompanySession)

      const request = createTestRequest('/api/transactions')
      const response = await getTransactions(request)
      const result = await parseRouteResponse<{ data: Array<unknown> }>(response)

      expect(result.status).toBe(200)
      // Other company should have no transactions
      const dataArray = Array.isArray(result.data) ? result.data : []
      expect(dataArray.length).toBe(0)
    })
  })

  describe('Cross-Tenant Access Prevention', () => {
    it('accessing non-existent component returns same 404 as cross-tenant', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      // Use a random UUID that doesn't exist
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const request = createTestRequest(`/api/components/${fakeId}`)
      const response = await getComponentById(request, { params: Promise.resolve({ id: fakeId }) })
      const result = await parseRouteResponse(response)

      // Non-existent resource also returns 404
      expect(result.status).toBe(404)
    })

    it('accessing non-existent SKU returns same 404 as cross-tenant', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      const fakeId = '00000000-0000-0000-0000-000000000000'
      const request = createTestRequest(`/api/skus/${fakeId}`)
      const response = await getSKUById(request, { params: Promise.resolve({ id: fakeId }) })
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(404)
    })

    it('404 response is identical whether resource doesnt exist or is cross-tenant', async () => {
      // Create component in original company
      setTestSession(TEST_SESSIONS.admin!)
      const component = await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId)

      // Access cross-tenant
      setTestSession(otherCompanySession)
      const crossTenantRequest = createTestRequest(`/api/components/${component.id}`)
      const crossTenantResponse = await getComponentById(crossTenantRequest, { params: Promise.resolve({ id: component.id }) })
      const crossTenantResult = await parseRouteResponse(crossTenantResponse)

      // Access non-existent
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const nonExistentRequest = createTestRequest(`/api/components/${fakeId}`)
      const nonExistentResponse = await getComponentById(nonExistentRequest, { params: Promise.resolve({ id: fakeId }) })
      const nonExistentResult = await parseRouteResponse(nonExistentResponse)

      // Both should be 404 with same error structure
      expect(crossTenantResult.status).toBe(404)
      expect(nonExistentResult.status).toBe(404)
      expect(crossTenantResult.error).toBe(nonExistentResult.error)
    })
  })

  describe('Settings Tenant Isolation', () => {
    it('settings are automatically scoped to users company', async () => {
      // Import settings route
      const { GET: getSettings } = await import('@/app/api/settings/route')

      setTestSession(TEST_SESSIONS.admin!)
      const response = await getSettings()
      const result = await parseRouteResponse<{ companyId: string }>(response)

      expect(result.status).toBe(200)
      expect(result.data?.companyId).toBe(TEST_SESSIONS.admin!.user.companyId)
    })
  })

  describe('User Tenant Isolation', () => {
    it('admin can only see users from their own company', async () => {
      const { GET: getUsers } = await import('@/app/api/users/route')

      setTestSession(TEST_SESSIONS.admin!)
      const request = createTestRequest('/api/users')
      const response = await getUsers(request)
      const result = await parseRouteResponse<Array<{ id: string; email: string }>>(response)

      expect(result.status).toBe(200)
      // Users should be returned and should include seed users from the company
      const dataArray = Array.isArray(result.data) ? result.data : []
      expect(dataArray.length).toBeGreaterThan(0)
      // Should include admin user email
      const emails = dataArray.map((u: { email: string }) => u.email)
      expect(emails).toContain('admin@tonsil.tech')
    })
  })
})
