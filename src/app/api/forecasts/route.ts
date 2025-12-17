import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { paginated, unauthorized, serverError, parseQuery, error } from '@/lib/api-response'
import {
  forecastListQuerySchema,
  ComponentForecast,
  ComponentForecastResponse,
} from '@/types/forecast'
import { getComponentForecasts } from '@/services/forecast'

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
 * GET /api/forecasts - List component forecasts with filtering and pagination
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { searchParams } = new URL(request.url)
    const queryResult = parseQuery(searchParams, forecastListQuerySchema)
    if (queryResult.error) return queryResult.error

    const { page, pageSize, lookbackDays, safetyDays, sortBy, sortOrder, showOnlyAtRisk } =
      queryResult.data

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return error('No company selected. Please select a company from the sidebar.', 400)
    }

    // Build config override if query params provided
    const configOverride: { lookbackDays?: number; safetyDays?: number } = {}
    if (lookbackDays !== undefined) configOverride.lookbackDays = lookbackDays
    if (safetyDays !== undefined) configOverride.safetyDays = safetyDays

    // Get all forecasts for company
    const forecasts = await getComponentForecasts(
      selectedCompanyId,
      Object.keys(configOverride).length > 0 ? configOverride : undefined
    )

    // Apply showOnlyAtRisk filter if enabled
    // Components are "at risk" if they have a recommendedReorderDate (meaning they need reordering)
    let filteredForecasts = forecasts
    if (showOnlyAtRisk) {
      filteredForecasts = forecasts.filter((f) => f.recommendedReorderDate !== null)
    }

    // Apply sorting
    const sortedForecasts = [...filteredForecasts].sort((a, b) => {
      let comparison = 0

      switch (sortBy) {
        case 'runoutDate':
          // Null runout dates (infinite) go to the end when ascending
          if (a.runoutDate === null && b.runoutDate === null) comparison = 0
          else if (a.runoutDate === null) comparison = 1
          else if (b.runoutDate === null) comparison = -1
          else comparison = a.runoutDate.getTime() - b.runoutDate.getTime()
          break
        case 'consumption':
          comparison = a.averageDailyConsumption - b.averageDailyConsumption
          break
        case 'name':
          comparison = a.componentName.localeCompare(b.componentName)
          break
        case 'reorderQty':
          comparison = a.recommendedReorderQty - b.recommendedReorderQty
          break
        default:
          comparison = 0
      }

      return sortOrder === 'desc' ? -comparison : comparison
    })

    // Apply pagination
    const total = sortedForecasts.length
    const start = (page - 1) * pageSize
    const paginatedForecasts = sortedForecasts.slice(start, start + pageSize)

    // Serialize forecasts for response
    const data = paginatedForecasts.map(serializeForecast)

    return paginated(data, total, page, pageSize)
  } catch (error) {
    console.error('Error listing forecasts:', error)
    return serverError()
  }
}
