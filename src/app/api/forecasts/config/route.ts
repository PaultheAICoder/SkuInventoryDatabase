import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  success,
  unauthorized,
  forbidden,
  serverError,
  parseBody,
  error,
} from '@/lib/api-response'
import { getForecastConfig, upsertForecastConfig } from '@/services/forecast'
import { updateForecastConfigSchema, ForecastConfigResponse } from '@/types/forecast'
import { prisma } from '@/lib/db'

/**
 * Get full forecast config with DB record details (id, timestamps)
 * If no DB record exists (using defaults), returns empty id and current timestamps
 */
async function getFullConfig(companyId: string): Promise<ForecastConfigResponse> {
  const dbConfig = await prisma.forecastConfig.findUnique({
    where: { companyId },
  })

  const config = await getForecastConfig(companyId)

  return {
    id: dbConfig?.id ?? '',
    companyId,
    lookbackDays: config.lookbackDays,
    safetyDays: config.safetyDays,
    excludedTransactionTypes: config.excludedTransactionTypes,
    createdAt: dbConfig?.createdAt.toISOString() ?? new Date().toISOString(),
    updatedAt: dbConfig?.updatedAt.toISOString() ?? new Date().toISOString(),
  }
}

/**
 * GET /api/forecasts/config - Get forecast configuration for the company
 * Any authenticated user can read the config
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return error('No company selected. Please select a company from the sidebar.', 400)
    }

    const config = await getFullConfig(selectedCompanyId)
    return success(config)
  } catch (error) {
    console.error('Error fetching forecast config:', error)
    return serverError()
  }
}

/**
 * PUT /api/forecasts/config - Update forecast configuration
 * Admin only
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    // Only admins can update config
    if (session.user.role !== 'admin') {
      return forbidden()
    }

    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return error('No company selected. Please select a company from the sidebar.', 400)
    }

    const bodyResult = await parseBody(request, updateForecastConfigSchema)
    if (bodyResult.error) return bodyResult.error

    const data = bodyResult.data

    // Update config (creates if doesn't exist)
    await upsertForecastConfig(selectedCompanyId, data)

    // Fetch updated config with timestamps
    const config = await getFullConfig(selectedCompanyId)

    return success({ config, message: 'Forecast configuration updated' })
  } catch (error) {
    console.error('Error updating forecast config:', error)
    return serverError()
  }
}
