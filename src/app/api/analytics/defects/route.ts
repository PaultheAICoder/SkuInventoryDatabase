import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { success, unauthorized, serverError, parseQuery } from '@/lib/api-response'
import { defectAnalyticsQuerySchema } from '@/types/analytics'
import {
  getDefectAnalytics,
  getSKUsWithBuilds,
  getBOMVersionsForFilter,
} from '@/services/analytics'
import {
  generateDefectAnalyticsExport,
  generateDefectAnalyticsFilename,
} from '@/services/analytics-export'

// GET /api/analytics/defects - Get defect analytics data
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { searchParams } = new URL(request.url)

    // Check if this is an export request
    const exportFormat = searchParams.get('export')
    if (exportFormat === 'csv') {
      const queryResult = parseQuery(searchParams, defectAnalyticsQuerySchema)
      if (queryResult.error) return queryResult.error

      const csv = await generateDefectAnalyticsExport(session.user.selectedCompanyId, queryResult.data)
      const filename = generateDefectAnalyticsFilename()

      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    }

    // Check if this is a filter options request
    const getFilters = searchParams.get('filters')
    if (getFilters === 'true') {
      const skuId = searchParams.get('skuId') || undefined

      const [skus, bomVersions] = await Promise.all([
        getSKUsWithBuilds(session.user.selectedCompanyId),
        getBOMVersionsForFilter(session.user.selectedCompanyId, skuId),
      ])

      return success({
        skus,
        bomVersions,
        salesChannels: ['Amazon', 'Shopify', 'TikTok', 'Generic'],
      })
    }

    // Regular analytics request
    const queryResult = parseQuery(searchParams, defectAnalyticsQuerySchema)
    if (queryResult.error) return queryResult.error

    const analytics = await getDefectAnalytics(session.user.selectedCompanyId, queryResult.data)
    return success(analytics)
  } catch (error) {
    console.error('Error fetching defect analytics:', error)
    return serverError()
  }
}
