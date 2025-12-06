import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock prisma - must be defined before vi.mock since vi.mock is hoisted
vi.mock('@/lib/db', () => ({
  prisma: {
    skuChannelMapping: {
      findUnique: vi.fn(),
    },
    shopifyConnection: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    shopifyOrder: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    shopifyOrderLine: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn((fn) =>
      fn({
        shopifyOrder: { update: vi.fn() },
        shopifyOrderLine: { deleteMany: vi.fn(), createMany: vi.fn() },
      })
    ),
  },
}))

// Mock crypto
vi.mock('@/lib/crypto', () => ({
  decryptToken: vi.fn((token: string) => `decrypted_${token}`),
}))

// Mock ShopifyClient
vi.mock('@/services/shopify', () => ({
  ShopifyClient: class MockShopifyClient {
    fetchOrders = vi.fn().mockResolvedValue([])
    testConnection = vi.fn().mockResolvedValue(true)
  },
}))

// Import after mocks are set up
import { lookupSkuMapping, getActiveConnection } from '@/services/shopify-sync'
import { prisma } from '@/lib/db'
import type { Mock } from 'vitest'

// Type helper for mocked Prisma methods
type MockedPrisma = typeof prisma & {
  skuChannelMapping: {
    findUnique: Mock
  }
  shopifyConnection: {
    findUnique: Mock
    update: Mock
  }
}

// Get typed access to mocked prisma
const mockPrisma = prisma as MockedPrisma

describe('lookupSkuMapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns unmapped for null variantId', async () => {
    const result = await lookupSkuMapping('company-1', null)
    expect(result).toEqual({ skuId: null, status: 'unmapped' })
    expect(mockPrisma.skuChannelMapping.findUnique).not.toHaveBeenCalled()
  })

  it('returns not_found when no mapping exists', async () => {
    mockPrisma.skuChannelMapping.findUnique.mockResolvedValue(null)

    const result = await lookupSkuMapping('company-1', 'variant-123')

    expect(result).toEqual({ skuId: null, status: 'not_found' })
    expect(mockPrisma.skuChannelMapping.findUnique).toHaveBeenCalledWith({
      where: {
        companyId_channelType_externalId: {
          companyId: 'company-1',
          channelType: 'shopify',
          externalId: 'variant-123',
        },
      },
      select: { skuId: true, isActive: true },
    })
  })

  it('returns not_found for inactive mapping', async () => {
    mockPrisma.skuChannelMapping.findUnique.mockResolvedValue({
      id: 'mapping-1',
      companyId: 'company-1',
      channelType: 'shopify',
      externalId: 'variant-123',
      externalSku: null,
      skuId: 'sku-123',
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await lookupSkuMapping('company-1', 'variant-123')

    expect(result).toEqual({ skuId: null, status: 'not_found' })
  })

  it('returns mapped with skuId for active mapping', async () => {
    mockPrisma.skuChannelMapping.findUnique.mockResolvedValue({
      id: 'mapping-1',
      companyId: 'company-1',
      channelType: 'shopify',
      externalId: 'variant-123',
      externalSku: null,
      skuId: 'sku-123',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await lookupSkuMapping('company-1', 'variant-123')

    expect(result).toEqual({ skuId: 'sku-123', status: 'mapped' })
  })
})

describe('getActiveConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null when no connection exists', async () => {
    mockPrisma.shopifyConnection.findUnique.mockResolvedValue(null)

    const result = await getActiveConnection('company-1')

    expect(result).toBeNull()
  })

  it('returns null when connection is inactive', async () => {
    mockPrisma.shopifyConnection.findUnique.mockResolvedValue({
      id: 'conn-1',
      shopName: 'test-store',
      companyId: 'company-1',
      accessToken: 'encrypted_token',
      isActive: false,
      lastSyncAt: null,
      syncStatus: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await getActiveConnection('company-1')

    expect(result).toBeNull()
  })

  it('returns null when accessToken is missing', async () => {
    mockPrisma.shopifyConnection.findUnique.mockResolvedValue({
      id: 'conn-1',
      shopName: 'test-store',
      companyId: 'company-1',
      accessToken: null,
      isActive: true,
      lastSyncAt: null,
      syncStatus: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await getActiveConnection('company-1')

    expect(result).toBeNull()
  })

  it('returns connection and client for active connection', async () => {
    mockPrisma.shopifyConnection.findUnique.mockResolvedValue({
      id: 'conn-1',
      shopName: 'test-store',
      companyId: 'company-1',
      accessToken: 'encrypted_token',
      isActive: true,
      lastSyncAt: null,
      syncStatus: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const result = await getActiveConnection('company-1')

    expect(result).not.toBeNull()
    expect(result?.connection).toEqual({
      id: 'conn-1',
      shopName: 'test-store',
      companyId: 'company-1',
    })
    expect(result?.client).toBeDefined()
  })
})

describe('syncOrders', () => {
  // Note: Full syncOrders tests would require more extensive mocking
  // and are better suited for integration tests with a test database.
  // The key behaviors tested here are the helper functions which
  // form the core of the sync logic.

  it('placeholder for integration tests', () => {
    // This would be tested with a real database in integration tests
    expect(true).toBe(true)
  })
})
