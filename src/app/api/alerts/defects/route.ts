import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  success,
  unauthorized,
  serverError,
  parseQuery,
  parseBody,
  created,
} from '@/lib/api-response'
import { alertQuerySchema, createThresholdSchema } from '@/types/alert'
import {
  getDefectAlerts,
  getDefectThresholds,
  createThreshold,
} from '@/services/alert'

/**
 * GET /api/alerts/defects
 * Get defect alerts or thresholds
 * Query params:
 * - thresholds=true: Get thresholds instead of alerts
 * - skuId: Filter by SKU
 * - acknowledged: 'true' | 'false' | 'all'
 * - severity: 'warning' | 'critical' | 'all'
 * - limit: Max number of results
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return unauthorized()

    const { searchParams } = new URL(request.url)

    // Check if requesting thresholds
    if (searchParams.get('thresholds') === 'true') {
      const thresholds = await getDefectThresholds(session.user.companyId)
      return success({ thresholds })
    }

    // Otherwise return alerts
    const queryResult = parseQuery(searchParams, alertQuerySchema)
    if (queryResult.error) return queryResult.error

    const alerts = await getDefectAlerts(session.user.companyId, queryResult.data)
    return success({ alerts })
  } catch (error) {
    console.error('Error fetching defect alerts:', error)
    return serverError()
  }
}

/**
 * POST /api/alerts/defects
 * Create a new defect threshold (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return unauthorized()
    if (session.user.role !== 'admin') {
      return unauthorized('Admin access required')
    }

    const bodyResult = await parseBody(request, createThresholdSchema)
    if (bodyResult.error) return bodyResult.error

    const threshold = await createThreshold(
      session.user.companyId,
      bodyResult.data,
      session.user.id
    )
    return created({ threshold })
  } catch (error) {
    console.error('Error creating threshold:', error)
    return serverError()
  }
}
