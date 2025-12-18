/**
 * Integration Test Context
 * Provides utilities for testing API routes with real database
 */
import { NextRequest } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { getTestPrisma, cleanupTestData } from './db'

let prisma: PrismaClient | null = null

/**
 * Get shared Prisma instance for integration tests
 */
export function getIntegrationPrisma(): PrismaClient {
  if (!prisma) {
    prisma = getTestPrisma()
  }
  return prisma
}

/**
 * Clean test data before each test
 * Preserves seed data (users, company, brand)
 * Creates default location for each company if needed
 */
export async function cleanupBeforeTest(): Promise<void> {
  const db = getIntegrationPrisma()
  await cleanupTestData(db)

  // Ensure each company has a default location after cleanup
  const companies = await db.company.findMany({ select: { id: true } })
  for (const company of companies) {
    const existing = await db.location.findFirst({
      where: { companyId: company.id, isDefault: true },
    })
    if (!existing) {
      await db.location.create({
        data: {
          companyId: company.id,
          name: 'Main Warehouse',
          type: 'warehouse',
          isDefault: true,
          isActive: true,
        },
      })
    }
  }
}

/**
 * Create a mock NextRequest for route handler testing
 */
export function createTestRequest(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    body?: Record<string, unknown>
    searchParams?: Record<string, string>
  } = {}
): NextRequest {
  const { method = 'GET', body, searchParams = {} } = options

  const url = new URL(path, 'http://localhost:4500')
  Object.entries(searchParams).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })

  const init = {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body && method !== 'GET' ? JSON.stringify(body) : undefined,
  }

  return new NextRequest(url, init)
}

/**
 * Parse route handler response for assertions
 */
export async function parseRouteResponse<T = unknown>(response: Response): Promise<{
  status: number
  data: T | null
  error: string | null
}> {
  const status = response.status
  const json = await response.json().catch(() => null)

  return {
    status,
    data: json?.data ?? json,
    error: json?.error ?? null,
  }
}

/**
 * Create test component in database with proper brand context
 */
export async function createTestComponentInDb(
  companyId: string,
  overrides: Partial<{
    name: string
    skuCode: string
    category: string
    reorderPoint: number
  }> = {}
): Promise<{ id: string; name: string; skuCode: string }> {
  const db = getIntegrationPrisma()

  // Get the company's first ACTIVE brand - matching what the route does
  const brand = await db.brand.findFirst({
    where: { company: { id: companyId }, isActive: true },
    orderBy: { createdAt: 'asc' },
  })

  if (!brand) {
    throw new Error('No brand found for company')
  }

  // Get admin user for createdById (via UserCompany)
  const admin = await db.user.findFirst({
    where: {
      userCompanies: {
        some: { companyId },
      },
      role: 'admin',
    },
  })

  const timestamp = Date.now()
  const component = await db.component.create({
    data: {
      brandId: brand.id,
      companyId, // Set companyId for direct company scoping
      name: overrides.name ?? `Test Component ${timestamp}`,
      skuCode: overrides.skuCode ?? `TC-${timestamp}`,
      category: overrides.category ?? 'Test',
      unitOfMeasure: 'each',
      costPerUnit: 10.0,
      reorderPoint: overrides.reorderPoint ?? 100,
      leadTimeDays: 7,
      createdById: admin?.id ?? brand.id, // fallback
      updatedById: admin?.id ?? brand.id,
    },
  })

  return { id: component.id, name: component.name, skuCode: component.skuCode }
}

/**
 * Create test SKU in database with proper brand context
 */
export async function createTestSKUInDb(
  companyId: string,
  overrides: Partial<{
    name: string
    internalCode: string
    salesChannel: string
  }> = {}
): Promise<{ id: string; name: string; internalCode: string }> {
  const db = getIntegrationPrisma()

  const brand = await db.brand.findFirst({
    where: { company: { id: companyId }, isActive: true },
    orderBy: { createdAt: 'asc' },
  })

  if (!brand) {
    throw new Error('No brand found for company')
  }

  const admin = await db.user.findFirst({
    where: {
      userCompanies: {
        some: { companyId },
      },
      role: 'admin',
    },
  })

  const timestamp = Date.now()
  const sku = await db.sKU.create({
    data: {
      brandId: brand.id,
      companyId, // Set companyId for direct company scoping
      name: overrides.name ?? `Test SKU ${timestamp}`,
      internalCode: overrides.internalCode ?? `SKU-${timestamp}`,
      salesChannel: overrides.salesChannel ?? 'Amazon',
      createdById: admin?.id ?? brand.id,
      updatedById: admin?.id ?? brand.id,
    },
  })

  return { id: sku.id, name: sku.name, internalCode: sku.internalCode }
}

/**
 * Create test receipt transaction in database
 */
export async function createTestReceiptInDb(
  companyId: string,
  componentId: string,
  quantity: number,
  locationId?: string
): Promise<{ id: string; quantity: number }> {
  const db = getIntegrationPrisma()

  const admin = await db.user.findFirst({
    where: {
      userCompanies: {
        some: { companyId },
      },
      role: 'admin',
    },
  })

  // Get location ID - use provided or get default
  let resolvedLocationId = locationId
  if (!resolvedLocationId) {
    const defaultLoc = await getOrCreateDefaultLocation(companyId)
    resolvedLocationId = defaultLoc.id
  }

  const transaction = await db.transaction.create({
    data: {
      companyId,
      type: 'receipt',
      date: new Date(),
      supplier: 'Test Supplier',
      createdById: admin?.id ?? companyId,
      locationId: resolvedLocationId,
      lines: {
        create: {
          componentId,
          quantityChange: quantity,
          costPerUnit: 10.0,
        },
      },
    },
    include: {
      lines: true,
    },
  })

  return { id: transaction.id, quantity }
}

/**
 * Create test location in database
 */
export async function createTestLocationInDb(
  companyId: string,
  overrides: Partial<{
    name: string
    type: 'warehouse' | 'threepl' | 'fba' | 'finished_goods'
    isDefault: boolean
  }> = {}
): Promise<{ id: string; name: string; type: string }> {
  const db = getIntegrationPrisma()
  const timestamp = Date.now()

  const location = await db.location.create({
    data: {
      companyId,
      name: overrides.name ?? `Test Location ${timestamp}`,
      type: overrides.type ?? 'warehouse',
      isDefault: overrides.isDefault ?? false,
      isActive: true,
    },
  })

  return { id: location.id, name: location.name, type: location.type }
}

/**
 * Get or create default location for a company
 */
export async function getOrCreateDefaultLocation(
  companyId: string
): Promise<{ id: string; name: string }> {
  const db = getIntegrationPrisma()

  let location = await db.location.findFirst({
    where: { companyId, isDefault: true },
  })

  if (!location) {
    location = await db.location.create({
      data: {
        companyId,
        name: 'Main Warehouse',
        type: 'warehouse',
        isDefault: true,
        isActive: true,
      },
    })
  }

  return { id: location.id, name: location.name }
}

/**
 * Create a transaction AND update InventoryBalance for quantity tracking
 * This mirrors what the service layer does when creating transactions
 * Required because getComponentsWithReorderStatus uses InventoryBalance for O(1) lookups
 */
export async function createTransactionWithBalance(
  companyId: string,
  componentId: string,
  quantity: number,
  options: {
    type?: 'initial' | 'receipt' | 'adjustment'
    locationId?: string
  } = {}
): Promise<{ transactionId: string; quantity: number }> {
  const db = getIntegrationPrisma()
  const { type = 'initial', locationId: providedLocationId } = options

  const admin = await db.user.findFirst({
    where: {
      userCompanies: { some: { companyId } },
      role: 'admin',
    },
  })

  // Get location ID - use provided or get default
  const location = providedLocationId
    ? await db.location.findUnique({ where: { id: providedLocationId } })
    : await db.location.findFirst({ where: { companyId, isDefault: true } })

  if (!location) {
    throw new Error('No location found for transaction')
  }

  // Create transaction with line
  const transaction = await db.transaction.create({
    data: {
      companyId,
      type,
      date: new Date(),
      status: 'approved',
      locationId: location.id,
      createdById: admin?.id ?? companyId,
      lines: {
        create: {
          componentId,
          quantityChange: quantity,
          costPerUnit: 10.0,
        },
      },
    },
  })

  // Update InventoryBalance (this is what the service layer does)
  await db.inventoryBalance.upsert({
    where: {
      componentId_locationId: {
        componentId,
        locationId: location.id,
      },
    },
    create: {
      componentId,
      locationId: location.id,
      quantity,
    },
    update: {
      quantity: {
        increment: quantity,
      },
    },
  })

  return { transactionId: transaction.id, quantity }
}

/**
 * Create multiple transaction lines with a single transaction AND update InventoryBalance
 * Useful for tests that need multiple components with different quantities
 */
export async function createBatchTransactionWithBalances(
  companyId: string,
  lines: Array<{ componentId: string; quantity: number }>,
  options: {
    type?: 'initial' | 'receipt' | 'adjustment'
    locationId?: string
  } = {}
): Promise<{ transactionId: string }> {
  const db = getIntegrationPrisma()
  const { type = 'initial', locationId: providedLocationId } = options

  const admin = await db.user.findFirst({
    where: {
      userCompanies: { some: { companyId } },
      role: 'admin',
    },
  })

  const location = providedLocationId
    ? await db.location.findUnique({ where: { id: providedLocationId } })
    : await db.location.findFirst({ where: { companyId, isDefault: true } })

  if (!location) {
    throw new Error('No location found for transaction')
  }

  // Create transaction with all lines
  const transaction = await db.transaction.create({
    data: {
      companyId,
      type,
      date: new Date(),
      status: 'approved',
      locationId: location.id,
      createdById: admin?.id ?? companyId,
      lines: {
        createMany: {
          data: lines.map(line => ({
            componentId: line.componentId,
            quantityChange: line.quantity,
            costPerUnit: 10.0,
          })),
        },
      },
    },
  })

  // Update InventoryBalance for each component
  for (const line of lines) {
    await db.inventoryBalance.upsert({
      where: {
        componentId_locationId: {
          componentId: line.componentId,
          locationId: location.id,
        },
      },
      create: {
        componentId: line.componentId,
        locationId: location.id,
        quantity: line.quantity,
      },
      update: {
        quantity: {
          increment: line.quantity,
        },
      },
    })
  }

  return { transactionId: transaction.id }
}
