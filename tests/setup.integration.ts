/**
 * Integration Test Setup
 * Run once before all integration tests
 */
import '@testing-library/jest-dom'
import { beforeAll, afterAll } from 'vitest'
import { getIntegrationPrisma } from './helpers/integration-context'
import { initializeTestSessions } from './helpers/auth-mock'
import { disconnectTestDb } from './helpers/db'

beforeAll(async () => {
  // Initialize session mocks with real user IDs from database
  const prisma = getIntegrationPrisma()
  await initializeTestSessions(prisma)
})

afterAll(async () => {
  await disconnectTestDb()
})
