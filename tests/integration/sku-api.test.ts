/**
 * SKU API Integration Tests
 * Regression tests for GitHub Issue #170 - SKU creation bug fix
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import {
  initializeTestSessions,
  setTestSession,
  TEST_SESSIONS,
  clearTestSession,
} from '../helpers/auth-mock'
import {
  getIntegrationPrisma,
  cleanupBeforeTest,
  createTestRequest,
  parseRouteResponse,
  createTestSKUInDb,
} from '../helpers/integration-context'
import { disconnectTestDb } from '../helpers/db'

import { POST as createSKU, GET as listSKUs } from '@/app/api/skus/route'
import { PATCH as updateSKU, GET as getSKU } from '@/app/api/skus/[id]/route'

describe('SKU API', () => {
  beforeAll(async () => {
    const prisma = getIntegrationPrisma()
    await initializeTestSessions(prisma)
  })

  beforeEach(async () => {
    await cleanupBeforeTest()
    setTestSession(TEST_SESSIONS.admin!)
  })

  afterAll(async () => {
    clearTestSession()
    await disconnectTestDb()
  })

  describe('POST /api/skus', () => {
    it('creates SKU with valid data', async () => {
      const request = createTestRequest('/api/skus', {
        method: 'POST',
        body: {
          name: 'Test SKU',
          internalCode: `TEST-${Date.now()}`,
          salesChannel: 'Amazon',
          externalIds: {},
          notes: null,
        },
      })

      const response = await createSKU(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(201)
      expect(result.data).toHaveProperty('id')
      expect(result.data).toHaveProperty('name', 'Test SKU')
    })

    it('returns 400 for missing required fields', async () => {
      const request = createTestRequest('/api/skus', {
        method: 'POST',
        body: {
          name: 'Test SKU',
          // Missing internalCode and salesChannel
          externalIds: {},
        },
      })

      const response = await createSKU(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(400)
    })

    it('returns 400 for invalid sales channel', async () => {
      const request = createTestRequest('/api/skus', {
        method: 'POST',
        body: {
          name: 'Test SKU',
          internalCode: `TEST-${Date.now()}`,
          salesChannel: 'InvalidChannel',
          externalIds: {},
        },
      })

      const response = await createSKU(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(400)
    })

    it('returns 409 for duplicate internal code', async () => {
      const code = `DUP-${Date.now()}`

      // Create first SKU
      const request1 = createTestRequest('/api/skus', {
        method: 'POST',
        body: {
          name: 'First SKU',
          internalCode: code,
          salesChannel: 'Amazon',
          externalIds: {},
        },
      })
      const response1 = await createSKU(request1)
      expect((await parseRouteResponse(response1)).status).toBe(201)

      // Try to create duplicate
      const request2 = createTestRequest('/api/skus', {
        method: 'POST',
        body: {
          name: 'Second SKU',
          internalCode: code,
          salesChannel: 'Amazon',
          externalIds: {},
        },
      })
      const response = await createSKU(request2)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(409)
      expect(result.error).toBe('Conflict')
    })

    it('returns 401 when not authenticated', async () => {
      clearTestSession()

      const request = createTestRequest('/api/skus', {
        method: 'POST',
        body: {
          name: 'Test SKU',
          internalCode: `TEST-${Date.now()}`,
          salesChannel: 'Amazon',
          externalIds: {},
        },
      })

      const response = await createSKU(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(401)
    })

    it('returns 401 for stale user session (user ID not in database)', async () => {
      // Create a session with a non-existent user ID (simulates stale JWT after DB reseed)
      const staleSession = {
        user: {
          id: '00000000-0000-0000-0000-000000000000', // Non-existent user
          email: 'deleted@example.com',
          name: 'Deleted User',
          role: 'admin' as const,
          companyId: TEST_SESSIONS.admin!.user.companyId,
          companyName: 'Tonsil Tech',
          selectedCompanyId: TEST_SESSIONS.admin!.user.selectedCompanyId,
        },
      }
      setTestSession(staleSession)

      const request = createTestRequest('/api/skus', {
        method: 'POST',
        body: {
          name: 'Test SKU',
          internalCode: `TEST-STALE-${Date.now()}`,
          salesChannel: 'Amazon',
          externalIds: {},
        },
      })

      const response = await createSKU(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(401)
      // API returns error response with message field
      expect((result.data as { message?: string })?.message).toContain('session has expired')
    })
  })

  describe('GET /api/skus', () => {
    it('lists SKUs for authenticated user', async () => {
      // Create a test SKU first
      const createRequest = createTestRequest('/api/skus', {
        method: 'POST',
        body: {
          name: 'List Test SKU',
          internalCode: `LIST-${Date.now()}`,
          salesChannel: 'Amazon',
          externalIds: {},
        },
      })
      await createSKU(createRequest)

      // List SKUs
      const request = createTestRequest('/api/skus')
      const response = await listSKUs(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(200)
      expect(Array.isArray(result.data)).toBe(true)
    })

    it('returns 401 when not authenticated', async () => {
      clearTestSession()

      const request = createTestRequest('/api/skus')
      const response = await listSKUs(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(401)
    })
  })

  describe('PATCH /api/skus/:id - Optimistic Locking', () => {
    it('returns version field in SKU response', async () => {
      // Create a SKU
      const companyId = TEST_SESSIONS.admin!.user.selectedCompanyId
      const sku = await createTestSKUInDb(companyId)

      // Fetch the SKU
      const request = createTestRequest(`/api/skus/${sku.id}`)
      const response = await getSKU(request, { params: Promise.resolve({ id: sku.id }) })
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(200)
      expect(result.data).toHaveProperty('version')
      expect((result.data as { version?: number })?.version).toBe(1) // Initial version
    })

    it('increments version on successful update', async () => {
      // Create a SKU
      const companyId = TEST_SESSIONS.admin!.user.selectedCompanyId
      const sku = await createTestSKUInDb(companyId)

      // Update the SKU
      const updateRequest = createTestRequest(`/api/skus/${sku.id}`, {
        method: 'PATCH',
        body: {
          name: 'Updated Name',
          version: 1,
        },
      })
      const updateResponse = await updateSKU(updateRequest, { params: Promise.resolve({ id: sku.id }) })
      const updateResult = await parseRouteResponse(updateResponse)

      expect(updateResult.status).toBe(200)
      expect((updateResult.data as { version?: number })?.version).toBe(2) // Version incremented
    })

    it('returns 409 VersionConflict when version is stale', async () => {
      // Create a SKU
      const companyId = TEST_SESSIONS.admin!.user.selectedCompanyId
      const sku = await createTestSKUInDb(companyId)

      // First update (succeeds)
      const firstUpdate = createTestRequest(`/api/skus/${sku.id}`, {
        method: 'PATCH',
        body: {
          name: 'First Update',
          version: 1,
        },
      })
      await updateSKU(firstUpdate, { params: Promise.resolve({ id: sku.id }) })

      // Second update with stale version (should fail)
      const staleUpdate = createTestRequest(`/api/skus/${sku.id}`, {
        method: 'PATCH',
        body: {
          name: 'Stale Update',
          version: 1, // Same version as first request, but DB is now at version 2
        },
      })
      const staleResponse = await updateSKU(staleUpdate, { params: Promise.resolve({ id: sku.id }) })
      const staleResult = await parseRouteResponse(staleResponse)

      expect(staleResult.status).toBe(409)
      expect(staleResult.error).toBe('VersionConflict')
    })

    it('allows update without version (backward compatibility)', async () => {
      // Create a SKU
      const companyId = TEST_SESSIONS.admin!.user.selectedCompanyId
      const sku = await createTestSKUInDb(companyId)

      // Update without version (should succeed for backward compatibility)
      const updateRequest = createTestRequest(`/api/skus/${sku.id}`, {
        method: 'PATCH',
        body: {
          name: 'Update without version',
          // No version field
        },
      })
      const updateResponse = await updateSKU(updateRequest, { params: Promise.resolve({ id: sku.id }) })
      const updateResult = await parseRouteResponse(updateResponse)

      expect(updateResult.status).toBe(200)
      expect((updateResult.data as { name?: string })?.name).toBe('Update without version')
    })
  })
})
