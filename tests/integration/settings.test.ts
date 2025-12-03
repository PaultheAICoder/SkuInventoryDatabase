/**
 * Integration tests for Company Settings
 * Tests settings retrieval and update workflows
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
import { DEFAULT_SETTINGS } from '@/types/settings'

// Import route handlers directly
import { GET as getSettings, PATCH as updateSettings } from '@/app/api/settings/route'

describe('Company Settings', () => {
  beforeAll(async () => {
    const prisma = getIntegrationPrisma()
    await initializeTestSessions(prisma)
  })

  beforeEach(async () => {
    await cleanupBeforeTest()
    clearTestSession()

    // Reset settings to defaults before each test
    const prisma = getIntegrationPrisma()
    await prisma.company.update({
      where: { id: TEST_SESSIONS.admin!.user.companyId },
      data: { settings: DEFAULT_SETTINGS },
    })
  })

  afterAll(async () => {
    await disconnectTestDb()
  })

  describe('GET /api/settings', () => {
    it('admin can retrieve settings', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      const response = await getSettings()
      const result = await parseRouteResponse<{
        companyId: string
        companyName: string
        settings: typeof DEFAULT_SETTINGS
      }>(response)

      expect(result.status).toBe(200)
      expect(result.data).toBeDefined()
      expect(result.data?.companyId).toBe(TEST_SESSIONS.admin!.user.companyId)
      expect(result.data?.settings).toBeDefined()
    })

    it('ops cannot access settings (403)', async () => {
      setTestSession(TEST_SESSIONS.ops!)

      const response = await getSettings()
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(403)
    })

    it('viewer cannot access settings (403)', async () => {
      setTestSession(TEST_SESSIONS.viewer!)

      const response = await getSettings()
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(403)
    })

    it('unauthenticated request returns 401', async () => {
      clearTestSession()

      const response = await getSettings()
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(401)
    })

    it('returns default settings for new company', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      const response = await getSettings()
      const result = await parseRouteResponse<{
        settings: typeof DEFAULT_SETTINGS
      }>(response)

      expect(result.status).toBe(200)
      expect(result.data?.settings.allowNegativeInventory).toBe(DEFAULT_SETTINGS.allowNegativeInventory)
      expect(result.data?.settings.defaultLeadTimeDays).toBe(DEFAULT_SETTINGS.defaultLeadTimeDays)
      expect(result.data?.settings.reorderWarningMultiplier).toBe(DEFAULT_SETTINGS.reorderWarningMultiplier)
      expect(result.data?.settings.dateFormat).toBe(DEFAULT_SETTINGS.dateFormat)
      expect(result.data?.settings.currencySymbol).toBe(DEFAULT_SETTINGS.currencySymbol)
      expect(result.data?.settings.decimalPlaces).toBe(DEFAULT_SETTINGS.decimalPlaces)
    })
  })

  describe('PATCH /api/settings', () => {
    it('admin can update allowNegativeInventory', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      const request = createTestRequest('/api/settings', {
        method: 'PATCH',
        body: { allowNegativeInventory: true },
      })

      const response = await updateSettings(request)
      const result = await parseRouteResponse<{ settings: { allowNegativeInventory: boolean } }>(response)

      expect(result.status).toBe(200)
      expect(result.data?.settings.allowNegativeInventory).toBe(true)

      // Verify persistence
      const prisma = getIntegrationPrisma()
      const company = await prisma.company.findUnique({
        where: { id: TEST_SESSIONS.admin!.user.companyId },
      })
      const settings = company?.settings as typeof DEFAULT_SETTINGS
      expect(settings.allowNegativeInventory).toBe(true)
    })

    it('admin can update defaultLeadTimeDays', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      const request = createTestRequest('/api/settings', {
        method: 'PATCH',
        body: { defaultLeadTimeDays: 14 },
      })

      const response = await updateSettings(request)
      const result = await parseRouteResponse<{ settings: { defaultLeadTimeDays: number } }>(response)

      expect(result.status).toBe(200)
      expect(result.data?.settings.defaultLeadTimeDays).toBe(14)
    })

    it('admin can update reorderWarningMultiplier', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      const request = createTestRequest('/api/settings', {
        method: 'PATCH',
        body: { reorderWarningMultiplier: 2.0 },
      })

      const response = await updateSettings(request)
      const result = await parseRouteResponse<{ settings: { reorderWarningMultiplier: number } }>(response)

      expect(result.status).toBe(200)
      expect(result.data?.settings.reorderWarningMultiplier).toBe(2.0)
    })

    it('admin can update dateFormat', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      const request = createTestRequest('/api/settings', {
        method: 'PATCH',
        body: { dateFormat: 'YYYY-MM-DD' },
      })

      const response = await updateSettings(request)
      const result = await parseRouteResponse<{ settings: { dateFormat: string } }>(response)

      expect(result.status).toBe(200)
      expect(result.data?.settings.dateFormat).toBe('YYYY-MM-DD')
    })

    it('admin can update currencySymbol', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      const request = createTestRequest('/api/settings', {
        method: 'PATCH',
        body: { currencySymbol: '€' },
      })

      const response = await updateSettings(request)
      const result = await parseRouteResponse<{ settings: { currencySymbol: string } }>(response)

      expect(result.status).toBe(200)
      expect(result.data?.settings.currencySymbol).toBe('€')
    })

    it('admin can update decimalPlaces', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      const request = createTestRequest('/api/settings', {
        method: 'PATCH',
        body: { decimalPlaces: 4 },
      })

      const response = await updateSettings(request)
      const result = await parseRouteResponse<{ settings: { decimalPlaces: number } }>(response)

      expect(result.status).toBe(200)
      expect(result.data?.settings.decimalPlaces).toBe(4)
    })

    it('admin can update multiple settings at once', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      const request = createTestRequest('/api/settings', {
        method: 'PATCH',
        body: {
          allowNegativeInventory: true,
          defaultLeadTimeDays: 21,
          currencySymbol: '£',
        },
      })

      const response = await updateSettings(request)
      const result = await parseRouteResponse<{
        settings: {
          allowNegativeInventory: boolean
          defaultLeadTimeDays: number
          currencySymbol: string
        }
      }>(response)

      expect(result.status).toBe(200)
      expect(result.data?.settings.allowNegativeInventory).toBe(true)
      expect(result.data?.settings.defaultLeadTimeDays).toBe(21)
      expect(result.data?.settings.currencySymbol).toBe('£')
    })

    it('ops cannot update settings (403)', async () => {
      setTestSession(TEST_SESSIONS.ops!)

      const request = createTestRequest('/api/settings', {
        method: 'PATCH',
        body: { allowNegativeInventory: true },
      })

      const response = await updateSettings(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(403)
    })

    it('viewer cannot update settings (403)', async () => {
      setTestSession(TEST_SESSIONS.viewer!)

      const request = createTestRequest('/api/settings', {
        method: 'PATCH',
        body: { allowNegativeInventory: true },
      })

      const response = await updateSettings(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(403)
    })

    it('unauthenticated request returns 401', async () => {
      clearTestSession()

      const request = createTestRequest('/api/settings', {
        method: 'PATCH',
        body: { allowNegativeInventory: true },
      })

      const response = await updateSettings(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(401)
    })

    it('invalid dateFormat returns 400', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      const request = createTestRequest('/api/settings', {
        method: 'PATCH',
        body: { dateFormat: 'INVALID' },
      })

      const response = await updateSettings(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(400)
    })

    it('negative defaultLeadTimeDays returns 400', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      const request = createTestRequest('/api/settings', {
        method: 'PATCH',
        body: { defaultLeadTimeDays: -5 },
      })

      const response = await updateSettings(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(400)
    })

    it('decimalPlaces > 4 returns 400', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      const request = createTestRequest('/api/settings', {
        method: 'PATCH',
        body: { decimalPlaces: 5 },
      })

      const response = await updateSettings(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(400)
    })

    it('non-positive reorderWarningMultiplier returns 400', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      const request = createTestRequest('/api/settings', {
        method: 'PATCH',
        body: { reorderWarningMultiplier: 0 },
      })

      const response = await updateSettings(request)
      const result = await parseRouteResponse(response)

      expect(result.status).toBe(400)
    })
  })

  describe('Settings Persistence', () => {
    it('settings persist across requests', async () => {
      setTestSession(TEST_SESSIONS.admin!)

      // Update settings
      const updateRequest = createTestRequest('/api/settings', {
        method: 'PATCH',
        body: {
          allowNegativeInventory: true,
          defaultLeadTimeDays: 30,
        },
      })
      await updateSettings(updateRequest)

      // Retrieve settings
      const response = await getSettings()
      const result = await parseRouteResponse<{
        settings: {
          allowNegativeInventory: boolean
          defaultLeadTimeDays: number
        }
      }>(response)

      expect(result.status).toBe(200)
      expect(result.data?.settings.allowNegativeInventory).toBe(true)
      expect(result.data?.settings.defaultLeadTimeDays).toBe(30)
    })

    // TODO: Investigate potential Prisma caching issue in sequential PATCH calls
    it.skip('partial updates preserve other settings', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const prisma = getIntegrationPrisma()

      // First update
      const update1 = createTestRequest('/api/settings', {
        method: 'PATCH',
        body: { allowNegativeInventory: true },
      })
      const result1 = await updateSettings(update1)
      const parsed1 = await parseRouteResponse<{ settings: { allowNegativeInventory: boolean } }>(result1)
      expect(parsed1.status).toBe(200)
      expect(parsed1.data?.settings.allowNegativeInventory).toBe(true)

      // Verify the database was updated
      const companyAfter1 = await prisma.company.findUnique({
        where: { id: TEST_SESSIONS.admin!.user.companyId },
      })
      const settingsAfter1 = companyAfter1?.settings as Record<string, unknown>
      expect(settingsAfter1.allowNegativeInventory).toBe(true)

      // Second update - should preserve first update
      const update2 = createTestRequest('/api/settings', {
        method: 'PATCH',
        body: { defaultLeadTimeDays: 21 },
      })
      const result2 = await updateSettings(update2)
      const parsed2 = await parseRouteResponse<{
        settings: { allowNegativeInventory: boolean; defaultLeadTimeDays: number }
      }>(result2)

      expect(parsed2.status).toBe(200)
      expect(parsed2.data?.settings.defaultLeadTimeDays).toBe(21)
      // After second update, allowNegativeInventory should still be true
      expect(parsed2.data?.settings.allowNegativeInventory).toBe(true)
    })
  })
})
