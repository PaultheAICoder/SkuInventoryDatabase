/**
 * Database Test Utilities
 * Provides helpers for connecting to test database and cleaning up test data
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

let testPrisma: PrismaClient | null = null
let testPool: Pool | null = null

/**
 * Get a PrismaClient instance for testing.
 * Uses TEST_DATABASE_URL if available, otherwise falls back to DATABASE_URL.
 */
export function getTestPrisma(): PrismaClient {
  if (!testPrisma) {
    const connectionString = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL or TEST_DATABASE_URL must be set for tests')
    }
    testPool = new Pool({ connectionString })
    const adapter = new PrismaPg(testPool)
    testPrisma = new PrismaClient({ adapter })
  }
  return testPrisma
}

/**
 * Clean up test data from the database.
 * Deletes records in correct order to respect foreign key constraints.
 */
export async function cleanupTestData(prisma: PrismaClient): Promise<void> {
  // Delete in correct order to respect foreign keys
  await prisma.defectAlert.deleteMany({}) // Must delete before transactions (FK constraint)
  await prisma.finishedGoodsLine.deleteMany({})
  await prisma.finishedGoodsBalance.deleteMany({}) // New balance table for SKUs
  await prisma.transactionLine.deleteMany({})
  await prisma.transaction.deleteMany({})
  await prisma.lotBalance.deleteMany({})
  await prisma.lot.deleteMany({})
  await prisma.inventoryBalance.deleteMany({}) // New balance table for components
  await prisma.bOMLine.deleteMany({})
  await prisma.bOMVersion.deleteMany({})
  await prisma.asinSkuMapping.deleteMany({}) // Must delete before SKU (FK constraint)
  await prisma.sKU.deleteMany({})
  await prisma.component.deleteMany({})
  await prisma.location.deleteMany({})
  await prisma.securityEvent.deleteMany({})
  // Clean up feedback system data
  await prisma.feedback.deleteMany({})
  await prisma.emailMonitorState.deleteMany({})
  // Clean up forecast config (FK to Company which is preserved)
  await prisma.forecastConfig.deleteMany({})
  // Don't delete users/brands/companies as they may be needed for auth
}

/**
 * Disconnect the test database and clean up resources.
 */
export async function disconnectTestDb(): Promise<void> {
  if (testPrisma) {
    await testPrisma.$disconnect()
    testPrisma = null
  }
  if (testPool) {
    await testPool.end()
    testPool = null
  }
}
