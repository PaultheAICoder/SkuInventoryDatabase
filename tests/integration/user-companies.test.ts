/**
 * Integration tests for User Company Assignments
 * Tests role preservation when updating company assignments
 *
 * Bug Fix: Issue #295 - PUT /api/users/[id]/companies was hardcoding roles
 * instead of preserving existing roles for non-primary companies
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
import { UserRole } from '@prisma/client'

// Import route handlers directly
import { GET, PUT } from '@/app/api/users/[id]/companies/route'

describe('User Company Assignments', () => {
  let testUserId: string
  let primaryCompanyId: string
  let secondCompanyId: string
  let thirdCompanyId: string

  beforeAll(async () => {
    const prisma = getIntegrationPrisma()
    await initializeTestSessions(prisma)
  })

  beforeEach(async () => {
    await cleanupBeforeTest()
    clearTestSession()

    const prisma = getIntegrationPrisma()

    // Get the primary company (Tonsil Tech from seed data)
    primaryCompanyId = TEST_SESSIONS.admin!.user.companyId

    // Create additional test companies
    const secondCompany = await prisma.company.create({
      data: { name: `Second Company ${Date.now()}` },
    })
    secondCompanyId = secondCompany.id

    const thirdCompany = await prisma.company.create({
      data: { name: `Third Company ${Date.now()}` },
    })
    thirdCompanyId = thirdCompany.id

    // Create test user with specific role assignments
    const testUser = await prisma.user.create({
      data: {
        name: `Test User ${Date.now()}`,
        email: `testuser-${Date.now()}@test.com`,
        passwordHash: 'test-password-hash', // Required field
        role: 'ops', // Global role
        userCompanies: {
          create: [
            {
              companyId: primaryCompanyId,
              role: UserRole.admin,
              isPrimary: true,
            },
            {
              companyId: secondCompanyId,
              role: UserRole.admin,  // Admin on non-primary company
              isPrimary: false,
            },
          ],
        },
      },
    })
    testUserId = testUser.id
  })

  afterAll(async () => {
    // Clean up test companies before disconnecting
    const prisma = getIntegrationPrisma()
    await prisma.userCompany.deleteMany({
      where: { companyId: { in: [secondCompanyId, thirdCompanyId].filter(Boolean) } },
    })
    await prisma.company.deleteMany({
      where: { id: { in: [secondCompanyId, thirdCompanyId].filter(Boolean) } },
    })
    await disconnectTestDb()
  })

  describe('GET /api/users/[id]/companies', () => {
    it('returns user company assignments with roles', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      const response = await GET(
        createTestRequest(`/api/users/${testUserId}/companies`),
        { params: Promise.resolve({ id: testUserId }) }
      )
      const result = await parseRouteResponse<{
        companyId: string
        role: string
        isPrimary: boolean
      }[]>(response)

      expect(result.status).toBe(200)
      expect(result.data).toHaveLength(2)

      const primaryAssignment = result.data?.find((uc) => uc.companyId === primaryCompanyId)
      expect(primaryAssignment?.role).toBe('admin')
      expect(primaryAssignment?.isPrimary).toBe(true)

      const secondAssignment = result.data?.find((uc) => uc.companyId === secondCompanyId)
      expect(secondAssignment?.role).toBe('admin')
      expect(secondAssignment?.isPrimary).toBe(false)
    })

    it('returns 403 for non-admin users', async () => {
      setTestSession(TEST_SESSIONS.ops!)

      const response = await GET(
        createTestRequest(`/api/users/${testUserId}/companies`),
        { params: Promise.resolve({ id: testUserId }) }
      )
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(403)
    })

    it('returns 401 for unauthenticated requests', async () => {
      clearTestSession()

      const response = await GET(
        createTestRequest(`/api/users/${testUserId}/companies`),
        { params: Promise.resolve({ id: testUserId }) }
      )
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(401)
    })
  })

  describe('PUT /api/users/[id]/companies - Role Preservation', () => {
    it('preserves admin role when adding new company', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      // User starts with:
      // - primaryCompany: admin (primary)
      // - secondCompany: admin (non-primary)
      // Now add thirdCompany - existing admin roles should be preserved

      const request = createTestRequest(`/api/users/${testUserId}/companies`, {
        method: 'PATCH', // Use PATCH as it's mapped to PUT in createTestRequest body handling
        body: { companyIds: [primaryCompanyId, secondCompanyId, thirdCompanyId] },
      })
      // Override to PUT since our route handler uses PUT
      const putRequest = new Request(request.url, {
        method: 'PUT',
        headers: request.headers,
        body: JSON.stringify({ companyIds: [primaryCompanyId, secondCompanyId, thirdCompanyId] }),
      })

      const response = await PUT(
        putRequest as unknown as import('next/server').NextRequest,
        { params: Promise.resolve({ id: testUserId }) }
      )
      const result = await parseRouteResponse<{
        companyId: string
        role: string
        isPrimary: boolean
      }[]>(response)

      expect(result.status).toBe(200)
      expect(result.data).toHaveLength(3)

      // Admin role on primary company should be preserved
      const primaryAssignment = result.data?.find((uc) => uc.companyId === primaryCompanyId)
      expect(primaryAssignment?.role).toBe('admin')
      expect(primaryAssignment?.isPrimary).toBe(true)

      // Admin role on non-primary company should be preserved (THE BUG FIX)
      const secondAssignment = result.data?.find((uc) => uc.companyId === secondCompanyId)
      expect(secondAssignment?.role).toBe('admin')
      expect(secondAssignment?.isPrimary).toBe(false)

      // New company should default to ops
      const thirdAssignment = result.data?.find((uc) => uc.companyId === thirdCompanyId)
      expect(thirdAssignment?.role).toBe('ops')
      expect(thirdAssignment?.isPrimary).toBe(false)
    })

    it('preserves admin role for non-primary companies', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      // This is the core bug test: non-primary company with admin role
      // should NOT be downgraded to ops when updating company list

      // Get current state
      const getResponse = await GET(
        createTestRequest(`/api/users/${testUserId}/companies`),
        { params: Promise.resolve({ id: testUserId }) }
      )
      const getCurrentResult = await parseRouteResponse<{
        companyId: string
        role: string
      }[]>(getResponse)

      // Verify initial state has admin on second company
      const initialSecond = getCurrentResult.data?.find((uc) => uc.companyId === secondCompanyId)
      expect(initialSecond?.role).toBe('admin')

      // Update with same companies (no change to list)
      const putRequest = new Request(`http://localhost/api/users/${testUserId}/companies`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyIds: [primaryCompanyId, secondCompanyId] }),
      })

      const response = await PUT(
        putRequest as unknown as import('next/server').NextRequest,
        { params: Promise.resolve({ id: testUserId }) }
      )
      const result = await parseRouteResponse<{
        companyId: string
        role: string
      }[]>(response)

      expect(result.status).toBe(200)

      // Admin role on non-primary company should STILL be admin (not ops)
      const updatedSecond = result.data?.find((uc) => uc.companyId === secondCompanyId)
      expect(updatedSecond?.role).toBe('admin')
    })

    it('preserves viewer role when updating companies', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const prisma = getIntegrationPrisma()

      // Update the user to have viewer role on secondCompany
      await prisma.userCompany.update({
        where: {
          userId_companyId: {
            userId: testUserId,
            companyId: secondCompanyId,
          },
        },
        data: { role: UserRole.viewer },
      })

      // Add third company
      const putRequest = new Request(`http://localhost/api/users/${testUserId}/companies`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyIds: [primaryCompanyId, secondCompanyId, thirdCompanyId] }),
      })

      const response = await PUT(
        putRequest as unknown as import('next/server').NextRequest,
        { params: Promise.resolve({ id: testUserId }) }
      )
      const result = await parseRouteResponse<{
        companyId: string
        role: string
      }[]>(response)

      expect(result.status).toBe(200)

      // Viewer role should be preserved
      const secondAssignment = result.data?.find((uc) => uc.companyId === secondCompanyId)
      expect(secondAssignment?.role).toBe('viewer')

      // New company should default to ops
      const thirdAssignment = result.data?.find((uc) => uc.companyId === thirdCompanyId)
      expect(thirdAssignment?.role).toBe('ops')
    })

    it('assigns default ops role to newly added companies', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      // Add third company (new assignment)
      const putRequest = new Request(`http://localhost/api/users/${testUserId}/companies`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyIds: [primaryCompanyId, secondCompanyId, thirdCompanyId] }),
      })

      const response = await PUT(
        putRequest as unknown as import('next/server').NextRequest,
        { params: Promise.resolve({ id: testUserId }) }
      )
      const result = await parseRouteResponse<{
        companyId: string
        role: string
      }[]>(response)

      expect(result.status).toBe(200)

      // Third company should have ops role (default for new assignments)
      const thirdAssignment = result.data?.find((uc) => uc.companyId === thirdCompanyId)
      expect(thirdAssignment?.role).toBe('ops')
    })

    it('preserves roles when removing and re-adding companies', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const prisma = getIntegrationPrisma()

      // First, add third company with viewer role directly
      await prisma.userCompany.create({
        data: {
          userId: testUserId,
          companyId: thirdCompanyId,
          role: UserRole.viewer,
          isPrimary: false,
        },
      })

      // Remove second company (keep primary and third)
      const removeRequest = new Request(`http://localhost/api/users/${testUserId}/companies`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyIds: [primaryCompanyId, thirdCompanyId] }),
      })

      const removeResponse = await PUT(
        removeRequest as unknown as import('next/server').NextRequest,
        { params: Promise.resolve({ id: testUserId }) }
      )
      const removeResult = await parseRouteResponse<{
        companyId: string
        role: string
      }[]>(removeResponse)

      expect(removeResult.status).toBe(200)
      expect(removeResult.data).toHaveLength(2)

      // Third company should still have viewer role
      const thirdAfterRemove = removeResult.data?.find((uc) => uc.companyId === thirdCompanyId)
      expect(thirdAfterRemove?.role).toBe('viewer')

      // Re-add second company
      const readdRequest = new Request(`http://localhost/api/users/${testUserId}/companies`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyIds: [primaryCompanyId, secondCompanyId, thirdCompanyId] }),
      })

      const readdResponse = await PUT(
        readdRequest as unknown as import('next/server').NextRequest,
        { params: Promise.resolve({ id: testUserId }) }
      )
      const readdResult = await parseRouteResponse<{
        companyId: string
        role: string
      }[]>(readdResponse)

      expect(readdResult.status).toBe(200)
      expect(readdResult.data).toHaveLength(3)

      // Third company should STILL have viewer role
      const thirdAfterReadd = readdResult.data?.find((uc) => uc.companyId === thirdCompanyId)
      expect(thirdAfterReadd?.role).toBe('viewer')

      // Second company was removed and re-added, so it gets default ops role
      // (This is expected behavior - removed assignments lose their role)
      const secondAfterReadd = readdResult.data?.find((uc) => uc.companyId === secondCompanyId)
      expect(secondAfterReadd?.role).toBe('ops')
    })

    it('returns 403 for non-admin users', async () => {
      setTestSession(TEST_SESSIONS.ops!)

      const putRequest = new Request(`http://localhost/api/users/${testUserId}/companies`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyIds: [primaryCompanyId] }),
      })

      const response = await PUT(
        putRequest as unknown as import('next/server').NextRequest,
        { params: Promise.resolve({ id: testUserId }) }
      )
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(403)
    })

    it('returns 401 for unauthenticated requests', async () => {
      clearTestSession()

      const putRequest = new Request(`http://localhost/api/users/${testUserId}/companies`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyIds: [primaryCompanyId] }),
      })

      const response = await PUT(
        putRequest as unknown as import('next/server').NextRequest,
        { params: Promise.resolve({ id: testUserId }) }
      )
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(401)
    })

    it('returns 400 for non-existent company IDs', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      // Use a valid UUID format that doesn't exist in the database
      // Note: this uses a valid CUID-like format to pass Zod validation
      const nonExistentCompanyId = 'clz00000000000000000000000'

      const putRequest = new Request(`http://localhost/api/users/${testUserId}/companies`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyIds: [primaryCompanyId, nonExistentCompanyId] }),
      })

      const response = await PUT(
        putRequest as unknown as import('next/server').NextRequest,
        { params: Promise.resolve({ id: testUserId }) }
      )
      const result = await parseRouteResponse(response)

      // Zod validation will catch this before the database check since
      // the schema expects valid UUIDs
      expect(result.status).toBe(400)
    })

    it('returns 400 for invalid UUID format', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      const putRequest = new Request(`http://localhost/api/users/${testUserId}/companies`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyIds: [primaryCompanyId, 'not-a-valid-uuid'] }),
      })

      const response = await PUT(
        putRequest as unknown as import('next/server').NextRequest,
        { params: Promise.resolve({ id: testUserId }) }
      )
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(400)
      expect(result.error).toBe('Validation failed')
    })
  })
})
