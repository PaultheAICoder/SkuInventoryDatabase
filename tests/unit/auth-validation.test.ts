/**
 * Unit tests for authentication validation functions
 * Tests validateUserExists which checks if a user exists and is active in the database
 * Part of Issue #192: Fix stale JWT token handling after user deletion/deactivation
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { getTestPrisma, disconnectTestDb } from '../helpers/db'

// Mock the database module to use test database connection
// This must happen before importing any modules that use @/lib/db
vi.mock('@/lib/db', () => {
  const testPrisma = getTestPrisma()
  return {
    prisma: testPrisma,
    default: testPrisma,
  }
})

// Import after mocking
import { validateUserExists } from '@/lib/auth'

describe('validateUserExists', () => {
  const prisma = getTestPrisma()
  let activeUserId: string
  let inactiveUserId: string

  beforeAll(async () => {
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
          companyId: company.id,
          isActive: false,
        },
        select: { id: true },
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
