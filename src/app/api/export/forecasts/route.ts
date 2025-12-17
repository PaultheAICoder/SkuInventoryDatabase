import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { unauthorized, serverError, error } from '@/lib/api-response'
import { getComponentForecasts } from '@/services/forecast'
import {
  toCSV,
  forecastExportColumns,
  generateExportFilename,
  type ForecastExportData,
} from '@/services/export'

/**
 * Determine forecast status from consumption and reorder date
 */
function getForecastStatusString(
  dailyConsumption: number,
  recommendedReorderDate: Date | null
): string {
  if (dailyConsumption <= 0) return 'na'
  if (!recommendedReorderDate) return 'ok'

  const now = new Date()
  const reorderDate = new Date(recommendedReorderDate)
  const daysUntilReorder = Math.floor(
    (reorderDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  )

  if (daysUntilReorder <= 0) return 'critical'
  if (daysUntilReorder <= 7) return 'warning'
  return 'ok'
}

// GET /api/export/forecasts - Export all forecasts to CSV
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return error('No company selected. Please select a company from the sidebar.', 400)
    }

    // Parse optional query params for config override
    const { searchParams } = new URL(request.url)
    const lookbackDays = searchParams.get('lookbackDays')
      ? parseInt(searchParams.get('lookbackDays')!, 10)
      : undefined
    const safetyDays = searchParams.get('safetyDays')
      ? parseInt(searchParams.get('safetyDays')!, 10)
      : undefined

    // Build config override if query params provided
    const configOverride: { lookbackDays?: number; safetyDays?: number } = {}
    if (lookbackDays !== undefined) configOverride.lookbackDays = lookbackDays
    if (safetyDays !== undefined) configOverride.safetyDays = safetyDays

    // Get forecasts with optional config override
    const forecasts = await getComponentForecasts(
      selectedCompanyId,
      Object.keys(configOverride).length > 0 ? configOverride : undefined
    )

    // Get component categories for export
    const componentIds = forecasts.map((f) => f.componentId)
    const components = await prisma.component.findMany({
      where: { id: { in: componentIds } },
      select: { id: true, category: true },
    })
    const categoryMap = new Map(components.map((c) => [c.id, c.category]))

    // Transform to export format
    const exportData: ForecastExportData[] = forecasts.map((forecast) => ({
      componentName: forecast.componentName,
      skuCode: forecast.skuCode,
      category: categoryMap.get(forecast.componentId) ?? null,
      quantityOnHand: forecast.quantityOnHand,
      dailyConsumption: forecast.averageDailyConsumption.toFixed(4),
      daysUntilRunout: forecast.daysUntilRunout,
      runoutDate: forecast.runoutDate?.toISOString().split('T')[0] ?? null,
      recommendedReorderQty: forecast.recommendedReorderQty,
      reorderByDate: forecast.recommendedReorderDate?.toISOString().split('T')[0] ?? null,
      leadTimeDays: forecast.leadTimeDays,
      status: getForecastStatusString(
        forecast.averageDailyConsumption,
        forecast.recommendedReorderDate
      ),
      lookbackDays: forecast.assumptions.lookbackDays,
      safetyDays: forecast.assumptions.safetyDays,
    }))

    // Generate CSV
    const csv = toCSV(exportData, forecastExportColumns)

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${generateExportFilename('forecasts')}"`,
      },
    })
  } catch (error) {
    console.error('Error exporting forecasts:', error)
    return serverError()
  }
}
