import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { success, unauthorized, notFound, serverError, error } from '@/lib/api-response'
import { getComponentForecastById } from '@/services/forecast'
import { prisma } from '@/lib/db'
import { ComponentForecast, ComponentForecastResponse } from '@/types/forecast'

type RouteParams = { params: Promise<{ componentId: string }> }

/**
 * Serialize a ComponentForecast to ComponentForecastResponse format
 * Converts dates to ISO strings and decimals to fixed-precision strings
 */
function serializeForecast(f: ComponentForecast): ComponentForecastResponse {
  return {
    componentId: f.componentId,
    componentName: f.componentName,
    skuCode: f.skuCode,
    quantityOnHand: f.quantityOnHand,
    averageDailyConsumption: f.averageDailyConsumption.toFixed(4),
    daysUntilRunout: f.daysUntilRunout,
    runoutDate: f.runoutDate?.toISOString() ?? null,
    recommendedReorderQty: f.recommendedReorderQty,
    recommendedReorderDate: f.recommendedReorderDate?.toISOString() ?? null,
    leadTimeDays: f.leadTimeDays,
    assumptions: f.assumptions,
  }
}

/**
 * GET /api/forecasts/[componentId] - Get forecast for a specific component
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { componentId } = await params

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return error('No company selected. Please select a company from the sidebar.', 400)
    }

    // Verify component exists and belongs to user's selected company
    const component = await prisma.component.findFirst({
      where: {
        id: componentId,
        companyId: selectedCompanyId,
      },
      select: { id: true },
    })

    if (!component) {
      return notFound('Component')
    }

    // Parse optional query overrides
    const { searchParams } = new URL(request.url)
    const lookbackDaysParam = searchParams.get('lookbackDays')
    const safetyDaysParam = searchParams.get('safetyDays')
    const locationIdParam = searchParams.get('locationId')

    const configOverride: { lookbackDays?: number; safetyDays?: number } = {}
    if (lookbackDaysParam) {
      const parsed = parseInt(lookbackDaysParam, 10)
      if (!isNaN(parsed) && parsed >= 7 && parsed <= 365) {
        configOverride.lookbackDays = parsed
      }
    }
    if (safetyDaysParam) {
      const parsed = parseInt(safetyDaysParam, 10)
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 90) {
        configOverride.safetyDays = parsed
      }
    }

    // Get forecast for component with optional location filter
    const locationId = locationIdParam ?? undefined
    const forecast = await getComponentForecastById(
      componentId,
      Object.keys(configOverride).length > 0 ? configOverride : undefined,
      locationId
    )

    if (!forecast) {
      return notFound('Component')
    }

    return success(serializeForecast(forecast))
  } catch (error) {
    console.error('Error getting component forecast:', error)
    return serverError()
  }
}
