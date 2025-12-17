/**
 * Integration tests for Draft Transactions API
 * Tests GET/POST /api/transactions/drafts and related endpoints
 * Focus on selectedCompanyId validation (issue #287)
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import {
  setTestSession,
  clearTestSession,
  TEST_SESSIONS,
  initializeTestSessions,
  type TestUserSession,
} from '../helpers/auth-mock'
import {
  getIntegrationPrisma,
  cleanupBeforeTest,
  createTestRequest,
  createTestComponentInDb,
} from '../helpers/integration-context'
import { disconnectTestDb } from '../helpers/db'
import { toLocalDateString } from '@/lib/utils'

// Import route handlers directly
import { GET as getDrafts, POST as createDraft } from '@/app/api/transactions/drafts/route'
import { GET as getDraft, PUT as updateDraft, DELETE as deleteDraft } from '@/app/api/transactions/drafts/[id]/route'
import { POST as approveDraft } from '@/app/api/transactions/drafts/[id]/approve/route'
import { POST as rejectDraft } from '@/app/api/transactions/drafts/[id]/reject/route'
import { GET as getDraftCount } from '@/app/api/transactions/drafts/count/route'
import { POST as batchApproveDrafts } from '@/app/api/transactions/drafts/batch-approve/route'

/**
 * Create a test session with missing selectedCompanyId for security testing
 */
function createSessionWithoutCompany(): TestUserSession {
  return {
    user: {
      id: TEST_SESSIONS.admin!.user.id,
      email: TEST_SESSIONS.admin!.user.email,
      name: TEST_SESSIONS.admin!.user.name,
      role: TEST_SESSIONS.admin!.user.role,
      companyId: TEST_SESSIONS.admin!.user.companyId,
      companyName: TEST_SESSIONS.admin!.user.companyName,
      selectedCompanyId: undefined as unknown as string, // Simulate missing company
    },
  }
}

describe('Draft Transactions API - selectedCompanyId Validation (Issue #287)', () => {
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

  describe('GET /api/transactions/drafts', () => {
    it('returns 400 when selectedCompanyId is missing', async () => {
      setTestSession(createSessionWithoutCompany())

      const response = await getDrafts(createTestRequest('/api/transactions/drafts'))

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.message).toContain('No company selected')
    })

    it('returns 401 for unauthenticated request', async () => {
      clearTestSession()

      const response = await getDrafts(createTestRequest('/api/transactions/drafts'))

      expect(response.status).toBe(401)
    })

    it('returns paginated drafts for authenticated user with company', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      const response = await getDrafts(createTestRequest('/api/transactions/drafts'))
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.data).toBeDefined()
      expect(Array.isArray(json.data)).toBe(true)
      expect(json.pagination).toBeDefined()
    })
  })

  describe('POST /api/transactions/drafts', () => {
    it('returns 400 when selectedCompanyId is missing', async () => {
      setTestSession(createSessionWithoutCompany())
      const component = await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId)

      const request = new Request('http://localhost/api/transactions/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'receipt',
          date: toLocalDateString(new Date()),
          componentId: component.id,
          quantity: 100,
          supplier: 'Test Supplier',
        }),
      })

      const response = await createDraft(request as never)

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.message).toContain('No company selected')
    })

    it('returns 401 for unauthenticated request', async () => {
      clearTestSession()

      const request = new Request('http://localhost/api/transactions/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'receipt',
          date: toLocalDateString(new Date()),
          quantity: 100,
        }),
      })

      const response = await createDraft(request as never)

      expect(response.status).toBe(401)
    })
  })

  describe('GET /api/transactions/drafts/[id]', () => {
    it('returns 400 when selectedCompanyId is missing', async () => {
      setTestSession(createSessionWithoutCompany())

      const request = createTestRequest('/api/transactions/drafts/fake-id')
      const params = { params: Promise.resolve({ id: 'fake-id' }) }

      const response = await getDraft(request, params)

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.message).toContain('No company selected')
    })
  })

  describe('PUT /api/transactions/drafts/[id]', () => {
    it('returns 400 when selectedCompanyId is missing', async () => {
      setTestSession(createSessionWithoutCompany())

      const request = new Request('http://localhost/api/transactions/drafts/fake-id', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Updated notes' }),
      })
      const params = { params: Promise.resolve({ id: 'fake-id' }) }

      const response = await updateDraft(request as never, params)

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.message).toContain('No company selected')
    })
  })

  describe('DELETE /api/transactions/drafts/[id]', () => {
    it('returns 400 when selectedCompanyId is missing', async () => {
      setTestSession(createSessionWithoutCompany())

      const request = createTestRequest('/api/transactions/drafts/fake-id')
      const params = { params: Promise.resolve({ id: 'fake-id' }) }

      const response = await deleteDraft(request, params)

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.message).toContain('No company selected')
    })
  })

  describe('POST /api/transactions/drafts/[id]/approve', () => {
    it('returns 400 when selectedCompanyId is missing', async () => {
      setTestSession(createSessionWithoutCompany())

      const request = createTestRequest('/api/transactions/drafts/fake-id/approve')
      const params = { params: Promise.resolve({ id: 'fake-id' }) }

      const response = await approveDraft(request, params)

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.message).toContain('No company selected')
    })
  })

  describe('POST /api/transactions/drafts/[id]/reject', () => {
    it('returns 400 when selectedCompanyId is missing', async () => {
      setTestSession(createSessionWithoutCompany())

      const request = new Request('http://localhost/api/transactions/drafts/fake-id/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Test rejection' }),
      })
      const params = { params: Promise.resolve({ id: 'fake-id' }) }

      const response = await rejectDraft(request as never, params)

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.message).toContain('No company selected')
    })
  })

  describe('GET /api/transactions/drafts/count', () => {
    it('returns 400 when selectedCompanyId is missing', async () => {
      setTestSession(createSessionWithoutCompany())

      const response = await getDraftCount(createTestRequest('/api/transactions/drafts/count'))

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.message).toContain('No company selected')
    })

    it('returns count for authenticated user with company', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      const response = await getDraftCount(createTestRequest('/api/transactions/drafts/count'))
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(typeof json.count).toBe('number')
    })
  })

  describe('POST /api/transactions/drafts/batch-approve', () => {
    it('returns 400 when selectedCompanyId is missing', async () => {
      setTestSession(createSessionWithoutCompany())

      // Use valid RFC 4122 UUIDs to pass schema validation and reach companyId check
      // Version 4 UUIDs (random): position 14 = '4', position 19 = '8', '9', 'a', or 'b'
      const request = new Request('http://localhost/api/transactions/drafts/batch-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftIds: [
            'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5',
            'f1e2d3c4-b5a6-4978-8a9b-c0d1e2f3a4b5',
          ],
        }),
      })

      const response = await batchApproveDrafts(request as never)

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.message).toContain('No company selected')
    })
  })
})
