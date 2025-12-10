/**
 * Integration tests for authentication validation functions
 * Tests validateUserExists which checks if a user exists and is active in the database
 * Part of Issue #192: Fix stale JWT token handling after user deletion/deactivation
 *
 * NOTE: This is an integration test that requires a test database.
 * Tests are automatically skipped if TEST_DATABASE_URL is not set or database is unreachable.
 * To run: set TEST_DATABASE_URL=postgresql://... or run via docker-compose.test.yml
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'

// Check if test database is configured
const hasTestDatabase = !!process.env.TEST_DATABASE_URL

// Skip entire test suite if no test database configured
// This allows unit test runs to complete without requiring Docker
const describeWithDb = hasTestDatabase ? describe : describe.skip

// Only mock database if we have a test database to use
// Note: vi.mock is hoisted, but we check inside the factory to avoid throws at module load time
vi.mock('@/lib/db', async () => {
  // Only initialize prisma if TEST_DATABASE_URL is set
  // Otherwise return a dummy that won't be used (tests are skipped)
  if (!process.env.TEST_DATABASE_URL) {
    return {
      prisma: null,
      default: null,
    }
  }
  const dbHelpers = await import('../helpers/db')
  const testPrisma = dbHelpers.getTestPrisma()
  return {
    prisma: testPrisma,
    default: testPrisma,
  }
})

// Import after mocking
import { validateUserExists } from '@/lib/auth'

describeWithDb('validateUserExists', () => {
  // Module-level variables initialized in beforeAll
  let prisma: PrismaClient
  let disconnectTestDb: () => Promise<void>
  let activeUserId: string
  let inactiveUserId: string

  beforeAll(async () => {
    // Dynamically import db helpers
    const dbHelpers = await import('../helpers/db')
    prisma = dbHelpers.getTestPrisma()
    disconnectTestDb = dbHelpers.disconnectTestDb

    // Find an active user from seed data
    const activeUser = await prisma.user.findFirst({
      where: { isActive: true },
      select: { id: true },
    })
    if (!activeUser) {
      throw new Error('No active user found in test database')
    }
    activeUserId = activeUser.id

    // Find or create an inactive user for testing
    let inactiveUser = await prisma.user.findFirst({
      where: { isActive: false },
      select: { id: true },
    })

    if (!inactiveUser) {
      // Create a temporary inactive user for testing
      const company = await prisma.company.findFirst()
      if (!company) {
        throw new Error('No company found in test database')
      }
      inactiveUser = await prisma.user.create({
        data: {
          email: 'inactive-test-user@test.local',
          name: 'Inactive Test User',
          passwordHash: 'not-a-real-hash',
          role: 'viewer',
          isActive: false,
        },
        select: { id: true },
      })
      // Create UserCompany for test user
      await prisma.userCompany.create({
        data: {
          userId: inactiveUser.id,
          companyId: company.id,
          role: 'viewer',
          isPrimary: true,
        },
      })
    }
    inactiveUserId = inactiveUser.id
  })

  afterAll(async () => {
    // Clean up any test users created
    await prisma.user.deleteMany({
      where: { email: 'inactive-test-user@test.local' },
    })
    await disconnectTestDb()
  })

  describe('user exists and is active', () => {
    it('returns user with isActive=true for active user', async () => {
      const result = await validateUserExists(activeUserId)

      expect(result).not.toBeNull()
      expect(result?.id).toBe(activeUserId)
      expect(result?.isActive).toBe(true)
      expect(result?.email).toBeDefined()
    })
  })

  describe('user exists but is deactivated', () => {
    it('returns user with isActive=false for deactivated user', async () => {
      const result = await validateUserExists(inactiveUserId)

      expect(result).not.toBeNull()
      expect(result?.id).toBe(inactiveUserId)
      expect(result?.isActive).toBe(false)
    })
  })

  describe('user does not exist', () => {
    it('returns null for non-existent user ID', async () => {
      const fakeUserId = '00000000-0000-0000-0000-000000000000'
      const result = await validateUserExists(fakeUserId)

      expect(result).toBeNull()
    })

    it('returns null for invalid UUID format', async () => {
      const invalidId = 'not-a-valid-uuid'
      const result = await validateUserExists(invalidId)

      // Should return null without throwing (graceful handling)
      expect(result).toBeNull()
    })
  })

  describe('return value structure', () => {
    it('returns only id, email, and isActive fields', async () => {
      const result = await validateUserExists(activeUserId)

      expect(result).not.toBeNull()
      expect(Object.keys(result!).sort()).toEqual(['email', 'id', 'isActive'])
    })
  })
})
