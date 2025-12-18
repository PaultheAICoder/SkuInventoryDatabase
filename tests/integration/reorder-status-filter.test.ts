/**
 * Integration tests for DB-side reorder status filtering
 * Tests the getComponentsWithReorderStatus function (Issue #292)
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { setTestSession, clearTestSession, TEST_SESSIONS, initializeTestSessions } from '../helpers/auth-mock'
import {
  getIntegrationPrisma,
  cleanupBeforeTest,
  createTestRequest,
  createTestComponentInDb,
  createTransactionWithBalance,
  createBatchTransactionWithBalances,
} from '../helpers/integration-context'
import { disconnectTestDb } from '../helpers/db'
import { getComponentsWithReorderStatus } from '@/services/inventory'

// Import route handler for API testing
import { GET as getComponents } from '@/app/api/components/route'

describe('DB-side Reorder Status Filtering (Issue #292)', () => {
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

  describe('getComponentsWithReorderStatus', () => {
    it('returns critical status when quantity <= reorderPoint', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const companyId = TEST_SESSIONS.admin!.user.companyId

      // Create component with reorderPoint=100
      const component = await createTestComponentInDb(companyId, {
        name: 'Critical Component',
        skuCode: 'CRIT-001',
        reorderPoint: 100,
      })

      // Add initial transaction with quantity 50 (below reorderPoint)
      await createTransactionWithBalance(companyId, component.id, 50)

      const result = await getComponentsWithReorderStatus({
        companyId,
        page: 1,
        pageSize: 50,
        sortBy: 'name',
        sortOrder: 'asc',
        reorderStatus: 'critical',
        reorderWarningMultiplier: 1.5,
      })

      expect(result.total).toBe(1)
      expect(result.data.length).toBe(1)
      expect(result.data[0].id).toBe(component.id)
      expect(result.data[0].reorderStatus).toBe('critical')
      expect(result.data[0].quantityOnHand).toBe(50)
    })

    it('returns warning status when quantity > reorderPoint and <= reorderPoint * multiplier', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const companyId = TEST_SESSIONS.admin!.user.companyId

      // Create component with reorderPoint=100
      const component = await createTestComponentInDb(companyId, {
        name: 'Warning Component',
        skuCode: 'WARN-001',
        reorderPoint: 100,
      })

      // Add initial transaction with quantity 120 (above 100, below 150 with 1.5x multiplier)
      await createTransactionWithBalance(companyId, component.id, 120)

      const result = await getComponentsWithReorderStatus({
        companyId,
        page: 1,
        pageSize: 50,
        sortBy: 'name',
        sortOrder: 'asc',
        reorderStatus: 'warning',
        reorderWarningMultiplier: 1.5,
      })

      expect(result.total).toBe(1)
      expect(result.data.length).toBe(1)
      expect(result.data[0].id).toBe(component.id)
      expect(result.data[0].reorderStatus).toBe('warning')
      expect(result.data[0].quantityOnHand).toBe(120)
    })

    it('returns ok status when quantity > reorderPoint * multiplier', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const companyId = TEST_SESSIONS.admin!.user.companyId

      // Create component with reorderPoint=100
      const component = await createTestComponentInDb(companyId, {
        name: 'OK Component',
        skuCode: 'OK-001',
        reorderPoint: 100,
      })

      // Add initial transaction with quantity 200 (above 150 with 1.5x multiplier)
      await createTransactionWithBalance(companyId, component.id, 200)

      const result = await getComponentsWithReorderStatus({
        companyId,
        page: 1,
        pageSize: 50,
        sortBy: 'name',
        sortOrder: 'asc',
        reorderStatus: 'ok',
        reorderWarningMultiplier: 1.5,
      })

      expect(result.total).toBe(1)
      expect(result.data.length).toBe(1)
      expect(result.data[0].id).toBe(component.id)
      expect(result.data[0].reorderStatus).toBe('ok')
      expect(result.data[0].quantityOnHand).toBe(200)
    })

    it('returns ok status when reorderPoint is 0', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const companyId = TEST_SESSIONS.admin!.user.companyId

      // Create component with reorderPoint=0 (no reorder tracking)
      const component = await createTestComponentInDb(companyId, {
        name: 'No Reorder Component',
        skuCode: 'NORP-001',
        reorderPoint: 0,
      })

      const result = await getComponentsWithReorderStatus({
        companyId,
        page: 1,
        pageSize: 50,
        sortBy: 'name',
        sortOrder: 'asc',
        reorderStatus: 'ok',
        reorderWarningMultiplier: 1.5,
      })

      expect(result.total).toBe(1)
      expect(result.data.length).toBe(1)
      expect(result.data[0].id).toBe(component.id)
      expect(result.data[0].reorderStatus).toBe('ok')
    })

    it('filters correctly by reorderStatus - excludes non-matching', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const companyId = TEST_SESSIONS.admin!.user.companyId

      // Create 3 components with different status levels
      const criticalComp = await createTestComponentInDb(companyId, {
        name: 'Critical A',
        skuCode: 'CRIT-A',
        reorderPoint: 100,
      })
      const warningComp = await createTestComponentInDb(companyId, {
        name: 'Warning B',
        skuCode: 'WARN-B',
        reorderPoint: 100,
      })
      const okComp = await createTestComponentInDb(companyId, {
        name: 'OK C',
        skuCode: 'OK-C',
        reorderPoint: 100,
      })

      // Set quantities: critical=50, warning=120, ok=200
      await createBatchTransactionWithBalances(companyId, [
        { componentId: criticalComp.id, quantity: 50 },
        { componentId: warningComp.id, quantity: 120 },
        { componentId: okComp.id, quantity: 200 },
      ])

      // Query for critical only
      const criticalResult = await getComponentsWithReorderStatus({
        companyId,
        page: 1,
        pageSize: 50,
        sortBy: 'name',
        sortOrder: 'asc',
        reorderStatus: 'critical',
        reorderWarningMultiplier: 1.5,
      })

      expect(criticalResult.total).toBe(1)
      expect(criticalResult.data[0].id).toBe(criticalComp.id)

      // Query for warning only
      const warningResult = await getComponentsWithReorderStatus({
        companyId,
        page: 1,
        pageSize: 50,
        sortBy: 'name',
        sortOrder: 'asc',
        reorderStatus: 'warning',
        reorderWarningMultiplier: 1.5,
      })

      expect(warningResult.total).toBe(1)
      expect(warningResult.data[0].id).toBe(warningComp.id)

      // Query for ok only
      const okResult = await getComponentsWithReorderStatus({
        companyId,
        page: 1,
        pageSize: 50,
        sortBy: 'name',
        sortOrder: 'asc',
        reorderStatus: 'ok',
        reorderWarningMultiplier: 1.5,
      })

      expect(okResult.total).toBe(1)
      expect(okResult.data[0].id).toBe(okComp.id)
    })

    it('returns correct total count for pagination', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const companyId = TEST_SESSIONS.admin!.user.companyId

      // Create 5 critical components
      const components = []
      for (let i = 0; i < 5; i++) {
        components.push(await createTestComponentInDb(companyId, {
          name: `Critical ${i}`,
          skuCode: `CRIT-${i}`,
          reorderPoint: 100,
        }))
      }

      // Set all to critical (quantity 50)
      await createBatchTransactionWithBalances(
        companyId,
        components.map(c => ({ componentId: c.id, quantity: 50 }))
      )

      // Query with pageSize=2
      const result = await getComponentsWithReorderStatus({
        companyId,
        page: 1,
        pageSize: 2,
        sortBy: 'name',
        sortOrder: 'asc',
        reorderStatus: 'critical',
        reorderWarningMultiplier: 1.5,
      })

      expect(result.total).toBe(5) // Total count should be 5
      expect(result.data.length).toBe(2) // But only 2 returned due to pagination
    })

    it('respects custom reorderWarningMultiplier', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const companyId = TEST_SESSIONS.admin!.user.companyId

      // Create component with reorderPoint=100
      const component = await createTestComponentInDb(companyId, {
        name: 'Multiplier Test',
        skuCode: 'MULT-001',
        reorderPoint: 100,
      })

      // Add initial transaction with quantity 180
      await createTransactionWithBalance(companyId, component.id, 180)

      // With multiplier 1.5: threshold=150, quantity 180 -> 'ok'
      const result15 = await getComponentsWithReorderStatus({
        companyId,
        page: 1,
        pageSize: 50,
        sortBy: 'name',
        sortOrder: 'asc',
        reorderStatus: 'ok',
        reorderWarningMultiplier: 1.5,
      })
      expect(result15.total).toBe(1)

      // With multiplier 2.0: threshold=200, quantity 180 -> 'warning'
      const result20 = await getComponentsWithReorderStatus({
        companyId,
        page: 1,
        pageSize: 50,
        sortBy: 'name',
        sortOrder: 'asc',
        reorderStatus: 'warning',
        reorderWarningMultiplier: 2.0,
      })
      expect(result20.total).toBe(1)
    })

    it('filters by search term', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const companyId = TEST_SESSIONS.admin!.user.companyId

      // Create components
      const alpha = await createTestComponentInDb(companyId, {
        name: 'Alpha Widget',
        skuCode: 'ALPHA-001',
        reorderPoint: 100,
      })
      const beta = await createTestComponentInDb(companyId, {
        name: 'Beta Gadget',
        skuCode: 'BETA-001',
        reorderPoint: 100,
      })

      // Set both to critical
      await createBatchTransactionWithBalances(companyId, [
        { componentId: alpha.id, quantity: 50 },
        { componentId: beta.id, quantity: 50 },
      ])

      // Search for "Alpha"
      const result = await getComponentsWithReorderStatus({
        companyId,
        page: 1,
        pageSize: 50,
        sortBy: 'name',
        sortOrder: 'asc',
        search: 'Alpha',
        reorderStatus: 'critical',
        reorderWarningMultiplier: 1.5,
      })

      expect(result.total).toBe(1)
      expect(result.data[0].id).toBe(alpha.id)
    })
  })

  describe('API Route Integration', () => {
    it('uses DB-side filtering for reorderStatus parameter', async () => {
      setTestSession(TEST_SESSIONS.admin!)
      const companyId = TEST_SESSIONS.admin!.user.companyId

      // Create critical component
      const component = await createTestComponentInDb(companyId, {
        name: 'API Test Critical',
        skuCode: 'API-CRIT-001',
        reorderPoint: 100,
      })

      await createTransactionWithBalance(companyId, component.id, 50)

      const request = createTestRequest('/api/components', {
        method: 'GET',
        searchParams: {
          reorderStatus: 'critical',
          page: '1',
          pageSize: '50',
        },
      })

      const response = await getComponents(request)
      // parseRouteResponse returns json.data (the array) not the full paginated response
      // So we need to parse the full JSON directly
      const status = response.status
      const json = await response.json()

      expect(status).toBe(200)
      expect(json.meta.total).toBe(1)
      expect(json.data[0].id).toBe(component.id)
      expect(json.data[0].reorderStatus).toBe('critical')
    })
  })
})
