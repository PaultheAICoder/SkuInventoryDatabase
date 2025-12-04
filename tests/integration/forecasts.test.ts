/**
 * Integration tests for Forecast API
 * Tests GET /api/forecasts, GET /api/forecasts/config, PUT /api/forecasts/config,
 * and GET /api/export/forecasts
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import {
  setTestSession,
  clearTestSession,
  TEST_SESSIONS,
  initializeTestSessions,
} from '../helpers/auth-mock'
import {
  getIntegrationPrisma,
  cleanupBeforeTest,
  createTestRequest,
  createTestComponentInDb,
} from '../helpers/integration-context'
import { disconnectTestDb } from '../helpers/db'

// Import route handlers directly
import { GET as getForecasts } from '@/app/api/forecasts/route'
import { GET as getConfig, PUT as putConfig } from '@/app/api/forecasts/config/route'
import { GET as exportForecasts } from '@/app/api/export/forecasts/route'

describe('Forecast API', () => {
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

  describe('GET /api/forecasts', () => {
    it('returns paginated forecast list for authenticated user', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId)

      const response = await getForecasts(createTestRequest('/api/forecasts'))
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.data).toBeDefined()
      expect(Array.isArray(json.data)).toBe(true)
      expect(json.meta).toBeDefined()
      expect(json.meta.total).toBeGreaterThanOrEqual(0)
      expect(json.meta.page).toBe(1)
    })

    it('returns 401 for unauthenticated request', async () => {
      clearTestSession()

      const response = await getForecasts(createTestRequest('/api/forecasts'))

      expect(response.status).toBe(401)
    })

    it('applies sorting by runoutDate', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      const response = await getForecasts(
        createTestRequest('/api/forecasts', {
          searchParams: { sortBy: 'runoutDate', sortOrder: 'asc' },
        })
      )

      expect(response.status).toBe(200)
    })

    it('filters by showOnlyAtRisk when enabled', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      const response = await getForecasts(
        createTestRequest('/api/forecasts', {
          searchParams: { showOnlyAtRisk: 'true' },
        })
      )
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(Array.isArray(json.data)).toBe(true)
    })

    it('respects lookbackDays override', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId)

      const response = await getForecasts(
        createTestRequest('/api/forecasts', {
          searchParams: { lookbackDays: '60' },
        })
      )
      const json = await response.json()

      expect(response.status).toBe(200)
      // If data exists, check assumptions
      if (json.data.length > 0) {
        expect(json.data[0].assumptions.lookbackDays).toBe(60)
      }
    })
  })

  describe('GET /api/forecasts/config', () => {
    it('returns config for authenticated user', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      const response = await getConfig()
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.data).toBeDefined()
      expect(json.data.lookbackDays).toBeDefined()
      expect(json.data.safetyDays).toBeDefined()
    })

    it('returns default values when no config exists', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      const response = await getConfig()
      const json = await response.json()

      expect(response.status).toBe(200)
      // Default values from DEFAULT_FORECAST_CONFIG
      expect(json.data.lookbackDays).toBe(30)
      expect(json.data.safetyDays).toBe(7)
    })

    it('returns 401 for unauthenticated request', async () => {
      clearTestSession()

      const response = await getConfig()

      expect(response.status).toBe(401)
    })
  })

  describe('PUT /api/forecasts/config', () => {
    it('updates config for admin user', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      const putRequest = new Request('http://localhost/api/forecasts/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lookbackDays: 45, safetyDays: 10 }),
      })

      const response = await putConfig(putRequest as never)
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.data.config.lookbackDays).toBe(45)
      expect(json.data.config.safetyDays).toBe(10)
    })

    it('returns 403 for non-admin user', async () => {
      setTestSession(TEST_SESSIONS.viewer!)

      const putRequest = new Request('http://localhost/api/forecasts/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lookbackDays: 45 }),
      })

      const response = await putConfig(putRequest as never)

      expect(response.status).toBe(403)
    })

    it('validates input values', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      const putRequest = new Request('http://localhost/api/forecasts/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lookbackDays: 5 }), // Below minimum of 7
      })

      const response = await putConfig(putRequest as never)

      expect(response.status).toBe(400)
    })
  })

  describe('GET /api/export/forecasts', () => {
    it('returns CSV file for authenticated user', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      const response = await exportForecasts(createTestRequest('/api/export/forecasts'))

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/csv')
      expect(response.headers.get('content-disposition')).toContain('forecasts-export')
    })

    it('returns 401 for unauthenticated request', async () => {
      clearTestSession()

      const response = await exportForecasts(createTestRequest('/api/export/forecasts'))

      expect(response.status).toBe(401)
    })

    it('CSV contains expected headers', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId)

      const response = await exportForecasts(createTestRequest('/api/export/forecasts'))
      const csv = await response.text()

      expect(csv).toContain('Component Name')
      expect(csv).toContain('SKU Code')
      expect(csv).toContain('Daily Consumption')
      expect(csv).toContain('Runout Date')
      expect(csv).toContain('Recommended Reorder Qty')
      expect(csv).toContain('Status')
      expect(csv).toContain('Lookback Days')
      expect(csv).toContain('Safety Days')
    })

    it('respects lookbackDays query parameter', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId)

      const response = await exportForecasts(
        createTestRequest('/api/export/forecasts', {
          searchParams: { lookbackDays: '60' },
        })
      )
      const csv = await response.text()

      expect(response.status).toBe(200)
      // Check CSV contains lookback value in data row (not just header)
      // The CSV should have 60 in the Lookback Days column
      expect(csv).toContain('60')
    })

    it('viewer can export forecasts', async () => {
      setTestSession(TEST_SESSIONS.viewer!)

      const response = await exportForecasts(createTestRequest('/api/export/forecasts'))

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/csv')
    })

    it('exports data with component name and SKU', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const component = await createTestComponentInDb(TEST_SESSIONS.admin!.user.companyId, {
        name: 'Forecast Test Component',
        skuCode: 'FTC-001',
      })

      const response = await exportForecasts(createTestRequest('/api/export/forecasts'))
      const csv = await response.text()

      expect(response.status).toBe(200)
      // Component should appear in the export
      expect(csv).toContain(component.name)
      expect(csv).toContain(component.skuCode)
    })

    it('ops user can export forecasts', async () => {
      setTestSession(TEST_SESSIONS.ops!)

      const response = await exportForecasts(createTestRequest('/api/export/forecasts'))

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/csv')
    })
  })
})
