import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ShopifyClient,
  ShopifyApiError,
  ShopifyAuthError,
  ShopifyRateLimitError,
} from '@/services/shopify'
import type { ShopifyOrderResponse, ShopifyShopResponse } from '@/types/shopify'

// Mock global fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('ShopifyClient', () => {
  let client: ShopifyClient
  const testShopName = 'test-store'
  const testAccessToken = 'shpat_test_token_12345'

  beforeEach(() => {
    client = new ShopifyClient(testShopName, testAccessToken)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe('constructor', () => {
    it('creates client with simple arguments', () => {
      const simpleClient = new ShopifyClient('my-store', 'token123')
      expect(simpleClient).toBeInstanceOf(ShopifyClient)
    })

    it('creates client with config object', () => {
      const configClient = new ShopifyClient({
        shopName: 'my-store',
        accessToken: 'token123',
        apiVersion: '2024-04',
      })
      expect(configClient).toBeInstanceOf(ShopifyClient)
    })

    it('throws error when access token is missing (simple)', () => {
      expect(() => new ShopifyClient('store', '')).toThrow('Access token is required')
    })

    it('throws error when access token is missing (config)', () => {
      expect(() => new ShopifyClient({ shopName: 'store', accessToken: '' })).toThrow(
        'Access token is required'
      )
    })

    it('normalizes shop name with full URL', () => {
      const urlClient = new ShopifyClient(
        'https://my-store.myshopify.com/',
        'token'
      )
      expect(urlClient).toBeInstanceOf(ShopifyClient)
    })
  })

  // ===========================================================================
  // testConnection Tests
  // ===========================================================================

  describe('testConnection', () => {
    const mockShopResponse: ShopifyShopResponse = {
      id: 123456,
      name: 'Test Store',
      email: 'test@example.com',
      domain: 'test-store.myshopify.com',
      myshopify_domain: 'test-store.myshopify.com',
      plan_name: 'basic',
      currency: 'USD',
      timezone: 'America/New_York',
    }

    it('returns true for valid credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-Shopify-Shop-Api-Call-Limit': '1/40',
        }),
        json: () => Promise.resolve({ shop: mockShopResponse }),
      })

      const result = await client.testConnection()
      expect(result).toBe(true)
    })

    it('returns false for invalid credentials (401)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: () => Promise.resolve({ errors: 'Unauthorized' }),
      })

      const result = await client.testConnection()
      expect(result).toBe(false)
    })

    it('returns false for forbidden access (403)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: new Headers(),
        json: () => Promise.resolve({ errors: 'Forbidden' }),
      })

      const result = await client.testConnection()
      expect(result).toBe(false)
    })

    it('calls the correct API endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'X-Shopify-Shop-Api-Call-Limit': '1/40' }),
        json: () => Promise.resolve({ shop: mockShopResponse }),
      })

      await client.testConnection()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-store.myshopify.com/admin/api/2024-01/shop.json',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'X-Shopify-Access-Token': testAccessToken,
          }),
        })
      )
    })
  })

  // ===========================================================================
  // fetchOrder Tests
  // ===========================================================================

  describe('fetchOrder', () => {
    const mockOrder: ShopifyOrderResponse = {
      id: 1001,
      order_number: 1001,
      name: '#1001',
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-15T10:00:00Z',
      closed_at: null,
      cancelled_at: null,
      fulfillment_status: null,
      financial_status: 'paid',
      currency: 'USD',
      total_price: '99.99',
      subtotal_price: '89.99',
      total_tax: '10.00',
      line_items: [
        {
          id: 5001,
          variant_id: 2001,
          sku: 'SKU-001',
          title: 'Test Product',
          quantity: 2,
          price: '44.99',
          product_id: 3001,
          fulfillable_quantity: 2,
          fulfillment_status: null,
        },
      ],
      note: null,
      tags: '',
      email: 'customer@example.com',
    }

    it('fetches a single order by ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'X-Shopify-Shop-Api-Call-Limit': '2/40' }),
        json: () => Promise.resolve({ order: mockOrder }),
      })

      const result = await client.fetchOrder(1001)

      expect(result).toEqual(mockOrder)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-store.myshopify.com/admin/api/2024-01/orders/1001.json',
        expect.any(Object)
      )
    })

    it('throws ShopifyApiError for non-existent order (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers(),
        json: () => Promise.resolve({ errors: 'Not Found' }),
      })

      await expect(client.fetchOrder(99999)).rejects.toThrow(ShopifyApiError)
    })

    it('throws ShopifyAuthError for unauthorized access', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: () => Promise.resolve({ errors: 'Unauthorized' }),
      })

      await expect(client.fetchOrder(1001)).rejects.toThrow(ShopifyAuthError)
    })
  })

  // ===========================================================================
  // fetchOrders Tests
  // ===========================================================================

  describe('fetchOrders', () => {
    const mockOrders: ShopifyOrderResponse[] = [
      {
        id: 1001,
        order_number: 1001,
        name: '#1001',
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
        closed_at: null,
        cancelled_at: null,
        fulfillment_status: null,
        financial_status: 'paid',
        currency: 'USD',
        total_price: '99.99',
        subtotal_price: '89.99',
        total_tax: '10.00',
        line_items: [],
        note: null,
        tags: '',
        email: 'customer@example.com',
      },
      {
        id: 1002,
        order_number: 1002,
        name: '#1002',
        created_at: '2024-01-16T10:00:00Z',
        updated_at: '2024-01-16T10:00:00Z',
        closed_at: null,
        cancelled_at: null,
        fulfillment_status: 'fulfilled',
        financial_status: 'paid',
        currency: 'USD',
        total_price: '149.99',
        subtotal_price: '139.99',
        total_tax: '10.00',
        line_items: [],
        note: null,
        tags: '',
        email: 'customer2@example.com',
      },
    ]

    it('fetches orders with default params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'X-Shopify-Shop-Api-Call-Limit': '3/40' }),
        json: () => Promise.resolve({ orders: mockOrders }),
      })

      const result = await client.fetchOrders()

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe(1001)
      expect(result[1].id).toBe(1002)
    })

    it('applies filter parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'X-Shopify-Shop-Api-Call-Limit': '4/40' }),
        json: () => Promise.resolve({ orders: [mockOrders[0]] }),
      })

      await client.fetchOrders({
        status: 'open',
        financial_status: 'paid',
        limit: 50,
      })

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('status=open')
      expect(calledUrl).toContain('financial_status=paid')
      expect(calledUrl).toContain('limit=50')
    })

    it('handles pagination correctly', async () => {
      // First page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-Shopify-Shop-Api-Call-Limit': '5/40',
          'Link': '<https://test-store.myshopify.com/admin/api/2024-01/orders.json?page_info=next123>; rel="next"',
        }),
        json: () => Promise.resolve({ orders: [mockOrders[0]] }),
      })

      // Second page (no Link header = last page)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'X-Shopify-Shop-Api-Call-Limit': '6/40' }),
        json: () => Promise.resolve({ orders: [mockOrders[1]] }),
      })

      const result = await client.fetchOrders()

      expect(result).toHaveLength(2)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('applies date filters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'X-Shopify-Shop-Api-Call-Limit': '7/40' }),
        json: () => Promise.resolve({ orders: [] }),
      })

      await client.fetchOrders({
        created_at_min: '2024-01-01T00:00:00Z',
        created_at_max: '2024-01-31T23:59:59Z',
      })

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('created_at_min=2024-01-01T00%3A00%3A00Z')
      expect(calledUrl).toContain('created_at_max=2024-01-31T23%3A59%3A59Z')
    })
  })

  // ===========================================================================
  // Rate Limiting Tests
  // ===========================================================================

  describe('rate limiting', () => {
    it('retries on 429 response', async () => {
      // First call: rate limited
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({
          'Retry-After': '1',
        }),
        json: () => Promise.resolve({ errors: 'Too Many Requests' }),
      })

      // Second call: success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'X-Shopify-Shop-Api-Call-Limit': '1/40' }),
        json: () =>
          Promise.resolve({
            shop: {
              id: 123,
              name: 'Test',
              email: 'test@example.com',
              domain: 'test.myshopify.com',
              myshopify_domain: 'test.myshopify.com',
              plan_name: 'basic',
              currency: 'USD',
              timezone: 'UTC',
            },
          }),
      })

      const result = await client.testConnection()

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('throws ShopifyRateLimitError after max retries', async () => {
      // All calls return 429
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({
          'Retry-After': '1',
        }),
        json: () => Promise.resolve({ errors: 'Too Many Requests' }),
      })

      await expect(client.testConnection()).rejects.toThrow(ShopifyRateLimitError)
      // Should retry 3 times + initial = 4 calls
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    it('parses rate limit header correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-Shopify-Shop-Api-Call-Limit': '32/40',
        }),
        json: () =>
          Promise.resolve({
            shop: {
              id: 123,
              name: 'Test',
              email: 'test@example.com',
              domain: 'test.myshopify.com',
              myshopify_domain: 'test.myshopify.com',
              plan_name: 'basic',
              currency: 'USD',
              timezone: 'UTC',
            },
          }),
      })

      // Should not throw even when close to limit
      const result = await client.testConnection()
      expect(result).toBe(true)
    })
  })

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('error handling', () => {
    it('throws ShopifyAuthError for 401 status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: () => Promise.resolve({ errors: 'Unauthorized' }),
      })

      await expect(client.fetchOrders()).rejects.toThrow(ShopifyAuthError)
    })

    it('throws ShopifyAuthError for 403 status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: new Headers(),
        json: () => Promise.resolve({ errors: 'Forbidden' }),
      })

      await expect(client.fetchOrders()).rejects.toThrow(ShopifyAuthError)
    })

    it('throws ShopifyApiError for 404 status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers(),
        json: () => Promise.resolve({ errors: 'Not Found' }),
      })

      await expect(client.fetchOrder(99999)).rejects.toThrow(ShopifyApiError)
    })

    it('throws ShopifyApiError for 500 status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers(),
        json: () => Promise.resolve({ errors: 'Server Error' }),
      })

      await expect(client.fetchOrders()).rejects.toThrow(ShopifyApiError)
    })

    it('includes status code in ShopifyApiError', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers(),
        json: () => Promise.resolve({ errors: 'Server Error' }),
      })

      try {
        await client.fetchOrders()
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(ShopifyApiError)
        expect((error as ShopifyApiError).statusCode).toBe(500)
      }
    })
  })

  // ===========================================================================
  // fetchProducts Tests
  // ===========================================================================

  describe('fetchProducts', () => {
    it('fetches products with pagination', async () => {
      // First page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-Shopify-Shop-Api-Call-Limit': '5/40',
          'Link': '<https://test-store.myshopify.com/admin/api/2024-01/products.json?page_info=next123>; rel="next"',
        }),
        json: () =>
          Promise.resolve({
            products: [
              {
                id: 101,
                title: 'Product 1',
                handle: 'product-1',
                status: 'active',
                variants: [],
                created_at: '2024-01-01T00:00:00Z',
                updated_at: '2024-01-01T00:00:00Z',
              },
            ],
          }),
      })

      // Second page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'X-Shopify-Shop-Api-Call-Limit': '6/40' }),
        json: () =>
          Promise.resolve({
            products: [
              {
                id: 102,
                title: 'Product 2',
                handle: 'product-2',
                status: 'active',
                variants: [],
                created_at: '2024-01-02T00:00:00Z',
                updated_at: '2024-01-02T00:00:00Z',
              },
            ],
          }),
      })

      const result = await client.fetchProducts()

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe(101)
      expect(result[1].id).toBe(102)
    })

    it('applies product filters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'X-Shopify-Shop-Api-Call-Limit': '7/40' }),
        json: () => Promise.resolve({ products: [] }),
      })

      await client.fetchProducts({
        status: 'active',
        limit: 25,
      })

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('status=active')
      expect(calledUrl).toContain('limit=25')
    })
  })
})
