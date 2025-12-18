import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSelectedCompanyRole } from '@/lib/auth'
import { success, unauthorized, serverError } from '@/lib/api-response'
import { updateThresholdSchema } from '@/types/alert'
import {
  acknowledgeAlerts,
  updateThreshold,
  deleteThreshold,
} from '@/services/alert'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * PATCH /api/alerts/defects/[id]
 * Acknowledge an alert or update a threshold
 * Body: { acknowledge: true } to acknowledge alert
 * Body: { ...thresholdData } to update threshold (admin only)
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return unauthorized()
    const companyRole = getSelectedCompanyRole(session)
    if (companyRole === 'viewer') {
      return unauthorized('Insufficient permissions')
    }

    const { id } = await context.params
    const body = await request.json()

    // Check if acknowledging alert
    if (body.acknowledge) {
      const result = await acknowledgeAlerts([id], session.user.id)
      return success({ message: 'Alert acknowledged', count: result.count })
    }

    // Otherwise update threshold (admin only)
    if (companyRole !== 'admin') {
      return unauthorized('Admin access required')
    }

    const bodyResult = updateThresholdSchema.safeParse(body)
    if (!bodyResult.success) {
      return serverError('Invalid threshold data')
    }

    const threshold = await updateThreshold(id, bodyResult.data, session.user.id)
    return success({ threshold })
  } catch (error) {
    console.error('Error updating alert/threshold:', error)
    return serverError()
  }
}

/**
 * DELETE /api/alerts/defects/[id]
 * Delete a threshold (admin only)
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return unauthorized()
    const companyRole = getSelectedCompanyRole(session)
    if (companyRole !== 'admin') {
      return unauthorized('Admin access required')
    }

    const { id } = await context.params
    await deleteThreshold(id)
    return success({ message: 'Threshold deleted' })
  } catch (error) {
    console.error('Error deleting threshold:', error)
    return serverError()
  }
}
