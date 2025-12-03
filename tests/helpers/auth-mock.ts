/**
 * NextAuth Session Mocking for Integration Tests
 * Mocks getServerSession to return configurable test sessions
 */
import { vi } from 'vitest'
import type { Session } from 'next-auth'
import type { PrismaClient } from '@prisma/client'
import { getTestPrisma } from './db'

// Default test session (admin user)
let currentSession: Session | null = null

// Mock next-auth module - must be done before any imports that use it
vi.mock('next-auth', async () => {
  const actual = await vi.importActual('next-auth')
  return {
    ...actual,
    getServerSession: vi.fn(() => currentSession),
  }
})

// Mock the database module to use test database connection
vi.mock('@/lib/db', () => {
  const testPrisma = getTestPrisma()
  return {
    prisma: testPrisma,
    default: testPrisma,
  }
})

// Type-safe session structure matching src/lib/auth.ts
export interface TestUserSession {
  user: {
    id: string
    email: string
    name: string
    role: 'admin' | 'ops' | 'viewer'
    companyId: string
    companyName: string
  }
}

/**
 * Set the current mock session for tests
 * Call in beforeEach or at the start of a test
 */
export function setTestSession(session: TestUserSession | null): void {
  currentSession = session as Session | null
}

/**
 * Clear the current mock session (simulate logged out)
 */
export function clearTestSession(): void {
  currentSession = null
}

/**
 * Pre-built test sessions matching seed.ts users
 * IDs and companyId are populated from database in beforeAll
 */
export const TEST_SESSIONS = {
  admin: null as TestUserSession | null,
  ops: null as TestUserSession | null,
  viewer: null as TestUserSession | null,
}

// Track initialization status
let sessionsInitialized = false

/**
 * Initialize test sessions from database
 * Safe to call multiple times - only initializes once
 */
export async function initializeTestSessions(prisma: PrismaClient): Promise<void> {
  // Only initialize once
  if (sessionsInitialized && TEST_SESSIONS.admin !== null) {
    return
  }

  const [admin, ops, viewer, company] = await Promise.all([
    prisma.user.findUnique({ where: { email: 'admin@tonsil.tech' } }),
    prisma.user.findUnique({ where: { email: 'ops@tonsil.tech' } }),
    prisma.user.findUnique({ where: { email: 'viewer@tonsil.tech' } }),
    prisma.company.findFirst({ where: { name: 'Tonsil Tech' } }),
  ])

  if (!admin || !ops || !viewer || !company) {
    throw new Error('Test users or company not found. Run npm run db:seed first.')
  }

  TEST_SESSIONS.admin = {
    user: {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role as 'admin',
      companyId: company.id,
      companyName: company.name,
    },
  }

  TEST_SESSIONS.ops = {
    user: {
      id: ops.id,
      email: ops.email,
      name: ops.name,
      role: ops.role as 'ops',
      companyId: company.id,
      companyName: company.name,
    },
  }

  TEST_SESSIONS.viewer = {
    user: {
      id: viewer.id,
      email: viewer.email,
      name: viewer.name,
      role: viewer.role as 'viewer',
      companyId: company.id,
      companyName: company.name,
    },
  }

  sessionsInitialized = true
}
