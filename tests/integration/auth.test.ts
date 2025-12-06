/**
 * Integration tests for API Authentication
 * Tests that protected endpoints require authentication
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { setTestSession, clearTestSession, TEST_SESSIONS, initializeTestSessions } from '../helpers/auth-mock'
import {
  getIntegrationPrisma,
  cleanupBeforeTest,
  createTestRequest,
  parseRouteResponse,
} from '../helpers/integration-context'
import { disconnectTestDb } from '../helpers/db'

// Import route handlers directly
import { GET as getComponents, POST as createComponent } from '@/app/api/components/route'
import { GET as getSettings, PATCH as updateSettings } from '@/app/api/settings/route'
import { POST as createReceipt } from '@/app/api/transactions/receipt/route'
import { GET as getUsers, POST as createUser } from '@/app/api/users/route'

describe('API Authentication', () => {
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

  describe('Unauthenticated Access', () => {
    it('GET /api/components returns 401 when not authenticated', async () => {
      clearTestSession()

      const request = createTestRequest('/api/components')
      const response = await getComponents(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(401)
      expect(result.error).toBeTruthy()
    })

    it('POST /api/components returns 401 when not authenticated', async () => {
      clearTestSession()

      const request = createTestRequest('/api/components', {
        method: 'POST',
        body: { name: 'Test', skuCode: 'TEST-001', costPerUnit: 10 },
      })
      const response = await createComponent(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(401)
    })

    it('GET /api/settings returns 401 when not authenticated', async () => {
      clearTestSession()

      const response = await getSettings()
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(401)
    })

    it('PATCH /api/settings returns 401 when not authenticated', async () => {
      clearTestSession()

      const request = createTestRequest('/api/settings', {
        method: 'PATCH',
        body: { allowNegativeInventory: true },
      })
      const response = await updateSettings(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(401)
    })

    it('POST /api/transactions/receipt returns 401 when not authenticated', async () => {
      clearTestSession()

      const request = createTestRequest('/api/transactions/receipt', {
        method: 'POST',
        body: {
          componentId: 'fake-id',
          quantity: 50,
          supplier: 'Test Supplier',
          date: new Date().toISOString().split('T')[0],
        },
      })
      const response = await createReceipt(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(401)
    })
  })

  describe('Role-Based Authorization', () => {
    it('viewer cannot create transactions (401)', async () => {
      setTestSession(TEST_SESSIONS.viewer!)

      const request = createTestRequest('/api/transactions/receipt', {
        method: 'POST',
        body: {
          componentId: 'fake-id',
          quantity: 50,
          supplier: 'Test Supplier',
          date: new Date().toISOString().split('T')[0],
        },
      })
      const response = await createReceipt(request)
      const result = await parseRouteResponse(response)

      // Note: Receipt route returns 401 for role check (not 403)
      expect(result.status).toBe(401)
    })

    it('admin can access settings (200)', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      const response = await getSettings()
      const result = await parseRouteResponse<{ settings: unknown }>(response)

      expect(result.status).toBe(200)
      expect(result.data).toBeDefined()
      expect(result.data?.settings).toBeDefined()
    })

    it('ops cannot access settings (403)', async () => {
      setTestSession(TEST_SESSIONS.ops!)

      const response = await getSettings()
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(403)
    })
  })

  describe('Session Validation - Missing selectedCompanyId', () => {
    it('GET /api/users returns 400 when selectedCompanyId is missing', async () => {
      // Create a session with empty selectedCompanyId to simulate edge case
      const incompleteSession = {
        user: {
          id: TEST_SESSIONS.admin!.user.id,
          email: TEST_SESSIONS.admin!.user.email,
          name: TEST_SESSIONS.admin!.user.name,
          role: 'admin' as const,
          companyId: TEST_SESSIONS.admin!.user.companyId,
          companyName: TEST_SESSIONS.admin!.user.companyName,
          selectedCompanyId: '', // Empty string simulates missing
        },
      }
      setTestSession(incompleteSession)

      const request = createTestRequest('/api/users')
      const response = await getUsers(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(400)
      expect(result.error).toContain('company')
    })

    it('POST /api/users returns 400 when selectedCompanyId is missing', async () => {
      // Create a session with empty selectedCompanyId to simulate edge case
      const incompleteSession = {
        user: {
          id: TEST_SESSIONS.admin!.user.id,
          email: TEST_SESSIONS.admin!.user.email,
          name: TEST_SESSIONS.admin!.user.name,
          role: 'admin' as const,
          companyId: TEST_SESSIONS.admin!.user.companyId,
          companyName: TEST_SESSIONS.admin!.user.companyName,
          selectedCompanyId: '', // Empty string simulates missing
        },
      }
      setTestSession(incompleteSession)

      const request = createTestRequest('/api/users', {
        method: 'POST',
        body: {
          email: 'newuser@test.com',
          password: 'Password123!',
          name: 'Test User',
          role: 'ops',
        },
      })
      const response = await createUser(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(400)
      expect(result.error).toContain('company')
    })
  })

  describe('Stale JWT Token Handling', () => {
    /**
     * Note: The JWT callback validation runs before API routes receive the session.
     * Since we mock getServerSession directly in tests, these tests validate
     * the expected behavior when sessions have null/undefined user after JWT
     * callback invalidation. The actual JWT callback is tested via the
     * validateUserExists unit tests.
     */
    it('returns 401 when session user is undefined (simulates invalidated token)', async () => {
      // Simulate what happens after JWT callback invalidates a token:
      // The session callback returns a session with undefined user
      clearTestSession()

      const request = createTestRequest('/api/components')
      const response = await getComponents(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(401)
      expect(result.error).toBeTruthy()
    })

    it('GET /api/settings returns 401 when session is invalidated', async () => {
      // Clear session to simulate invalidated token scenario
      clearTestSession()

      const response = await getSettings()
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(401)
    })
  })
})
