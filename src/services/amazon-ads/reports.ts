/**
 * Amazon Ads Report Service
 *
 * Handles requesting, polling, downloading, and processing
 * search term reports from Amazon Advertising API.
 */

import { gunzipSync } from 'zlib'
import { prisma } from '@/lib/db'
import {
  requestReport,
  getReportStatus,
  downloadReport,
} from './client'
import type {
  ReportRequest,
  SearchTermReportRow,
  ParsedReportData,
  ReportSyncOptions,
  ReportSyncResult,
} from './types'

// ============================================
// Configuration
// ============================================

const POLL_INTERVAL_MS = 5000 // 5 seconds
const MAX_POLL_ATTEMPTS = 120 // 10 minutes max wait
const BATCH_SIZE = 100

// Column sets for different report types
const SP_SEARCH_TERM_COLUMNS = [
  'date',
  'campaignName',
  'adGroupName',
  'keyword',
  'searchTerm',
  'matchType',
  'impressions',
  'clicks',
  'cost',
  'attributedOrders7d',
  'attributedSales7d',
]

// ============================================
// Report Request & Polling
// ============================================

/**
 * Request a Sponsored Products search term report
 */
export async function requestSearchTermReport(
  credentialId: string,
  profileId: string,
  startDate: string,
  endDate: string
): Promise<{ success: boolean; reportId?: string; error?: string }> {
  const reportRequest: ReportRequest = {
    name: `SP Search Term Report ${startDate} to ${endDate}`,
    startDate,
    endDate,
    configuration: {
      adProduct: 'SPONSORED_PRODUCTS',
      groupBy: ['searchTerm'],
      columns: SP_SEARCH_TERM_COLUMNS,
      reportTypeId: 'spSearchTerm',
      timeUnit: 'DAILY',
      format: 'GZIP_JSON',
    },
  }

  const result = await requestReport(credentialId, profileId, reportRequest)

  if (!result.success || !result.data) {
    return {
      success: false,
      error: result.error?.message || 'Failed to request report',
    }
  }

  return {
    success: true,
    reportId: result.data.reportId,
  }
}

/**
 * Poll for report completion
 */
export async function pollReportStatus(
  credentialId: string,
  profileId: string,
  reportId: string
): Promise<{ success: boolean; downloadUrl?: string; error?: string }> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const result = await getReportStatus(credentialId, profileId, reportId)

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error?.message || 'Failed to get report status',
      }
    }

    const status = result.data.status

    if (status === 'COMPLETED') {
      return {
        success: true,
        downloadUrl: result.data.location,
      }
    }

    if (status === 'FAILED') {
      return {
        success: false,
        error: result.data.statusDetails || 'Report generation failed',
      }
    }

    // Still in progress, wait and retry
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  return {
    success: false,
    error: 'Report polling timed out',
  }
}

// ============================================
// Report Download & Parsing
// ============================================

/**
 * Download and decompress report data
 */
export async function downloadAndParseReport(
  downloadUrl: string
): Promise<{ success: boolean; data?: ParsedReportData; error?: string }> {
  const downloadResult = await downloadReport(downloadUrl)

  if (!downloadResult.success || !downloadResult.data) {
    return {
      success: false,
      error: downloadResult.error?.message || 'Failed to download report',
    }
  }

  try {
    // Decompress gzipped data
    const decompressed = gunzipSync(downloadResult.data)
    const jsonString = decompressed.toString('utf-8')
    const rows = JSON.parse(jsonString) as SearchTermReportRow[]

    return {
      success: true,
      data: {
        rows,
        totalRows: rows.length,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to parse report: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

// ============================================
// Data Mapping & Storage
// ============================================

/**
 * Normalize match type from Amazon format to our standard
 */
function normalizeMatchType(matchType: string): 'exact' | 'phrase' | 'broad' | 'auto' {
  const lower = matchType.toLowerCase()
  if (lower === 'exact') return 'exact'
  if (lower === 'phrase') return 'phrase'
  if (lower === 'broad') return 'broad'
  if (lower.includes('targeting') || lower === 'auto') return 'auto'
  return 'auto'
}

/**
 * Parse string to number, handling empty strings
 */
function parseNumber(value: string | undefined, defaultValue = 0): number {
  if (!value) return defaultValue
  const num = parseFloat(value)
  return isNaN(num) ? defaultValue : num
}

/**
 * Calculate derived metrics
 */
function calculateMetrics(
  impressions: number,
  clicks: number,
  spend: number,
  orders: number,
  sales: number
): { ctr?: number; cpc?: number; acos?: number; roas?: number; conversionRate?: number } {
  return {
    ctr: impressions > 0 ? clicks / impressions : undefined,
    cpc: clicks > 0 ? spend / clicks : undefined,
    acos: sales > 0 ? spend / sales : undefined,
    roas: spend > 0 ? sales / spend : undefined,
    conversionRate: clicks > 0 ? orders / clicks : undefined,
  }
}

/**
 * Process and store report rows to KeywordMetric
 */
export async function storeReportData(
  rows: SearchTermReportRow[],
  credentialId: string
): Promise<{ created: number; updated: number; failed: number; errors: string[] }> {
  let created = 0
  let updated = 0
  let failed = 0
  const errors: string[] = []

  // Lookup maps for portfolio/campaign/adGroup IDs
  const campaignMap = new Map<string, { id: string; portfolioId: string | null }>()
  const adGroupMap = new Map<string, string>()

  // Pre-load campaigns for this credential
  const campaigns = await prisma.adCampaign.findMany({
    where: { credentialId },
    select: { id: true, name: true, portfolioId: true },
  })
  campaigns.forEach(c => campaignMap.set(c.name, { id: c.id, portfolioId: c.portfolioId }))

  // Pre-load ad groups
  const adGroups = await prisma.adGroup.findMany({
    where: { campaign: { credentialId } },
    select: { id: true, name: true, campaignId: true },
  })
  adGroups.forEach(ag => adGroupMap.set(`${ag.campaignId}:${ag.name}`, ag.id))

  // Process in batches
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)

    for (const row of batch) {
      try {
        const keyword = row.searchTerm?.trim() || row.keyword?.trim()
        if (!keyword) {
          failed++
          continue
        }

        const matchType = normalizeMatchType(row.matchType)
        const date = new Date(row.date)
        const impressions = parseNumber(row.impressions)
        const clicks = parseNumber(row.clicks)
        const spend = parseNumber(row.cost)
        const orders = parseNumber(row.attributedOrders7d)
        const sales = parseNumber(row.attributedSales7d)

        const metrics = calculateMetrics(impressions, clicks, spend, orders, sales)

        // Lookup campaign and ad group
        const campaignInfo = campaignMap.get(row.campaignName)
        const campaignId = campaignInfo?.id || null
        const portfolioId = campaignInfo?.portfolioId || null
        const adGroupId = campaignId
          ? adGroupMap.get(`${campaignId}:${row.adGroupName}`) || null
          : null

        // Check for existing record
        const existing = await prisma.keywordMetric.findFirst({
          where: {
            keyword,
            matchType,
            date,
            source: 'api',
            portfolioId,
            campaignId,
            adGroupId,
          },
        })

        if (existing) {
          await prisma.keywordMetric.update({
            where: { id: existing.id },
            data: {
              impressions,
              clicks,
              ctr: metrics.ctr,
              spend,
              cpc: metrics.cpc,
              orders,
              sales,
              roas: metrics.roas,
              acos: metrics.acos,
              conversionRate: metrics.conversionRate,
              updatedAt: new Date(),
            },
          })
          updated++
        } else {
          await prisma.keywordMetric.create({
            data: {
              keyword,
              matchType,
              date,
              portfolioId,
              campaignId,
              adGroupId,
              impressions,
              clicks,
              ctr: metrics.ctr,
              spend,
              cpc: metrics.cpc,
              orders,
              sales,
              roas: metrics.roas,
              acos: metrics.acos,
              conversionRate: metrics.conversionRate,
              source: 'api',
              metadata: {
                originalSearchTerm: row.searchTerm,
                originalKeyword: row.keyword,
              },
            },
          })
          created++
        }
      } catch (error) {
        failed++
        errors.push(`Row error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }
  }

  return { created, updated, failed, errors }
}

// ============================================
// Main Sync Orchestrator
// ============================================

/**
 * Full report sync workflow
 */
export async function syncSearchTermReport(
  options: ReportSyncOptions
): Promise<ReportSyncResult> {
  const startTime = Date.now()
  const errors: string[] = []
  let recordsProcessed = 0
  let recordsCreated = 0
  let recordsUpdated = 0
  let recordsFailed = 0
  let reportId: string | undefined

  // Create sync log
  const syncLog = await prisma.syncLog.create({
    data: {
      credentialId: options.credentialId,
      integrationType: 'amazon_ads',
      syncType: 'full',
      status: 'running',
      triggeredById: options.triggeredById,
      metadata: {
        reportType: 'spSearchTerm',
        dateRange: options.dateRange,
      },
    },
  })

  try {
    // Step 1: Request report
    const requestResult = await requestSearchTermReport(
      options.credentialId,
      options.profileId,
      options.dateRange.startDate,
      options.dateRange.endDate
    )

    if (!requestResult.success || !requestResult.reportId) {
      throw new Error(requestResult.error || 'Failed to request report')
    }

    reportId = requestResult.reportId

    // Step 2: Poll for completion
    const pollResult = await pollReportStatus(
      options.credentialId,
      options.profileId,
      reportId
    )

    if (!pollResult.success || !pollResult.downloadUrl) {
      throw new Error(pollResult.error || 'Report generation failed')
    }

    // Step 3: Download and parse
    const parseResult = await downloadAndParseReport(pollResult.downloadUrl)

    if (!parseResult.success || !parseResult.data) {
      throw new Error(parseResult.error || 'Failed to parse report')
    }

    recordsProcessed = parseResult.data.totalRows

    // Step 4: Store data
    const storeResult = await storeReportData(
      parseResult.data.rows,
      options.credentialId
    )

    recordsCreated = storeResult.created
    recordsUpdated = storeResult.updated
    recordsFailed = storeResult.failed
    errors.push(...storeResult.errors)

    // Update sync log
    const status = errors.length > 0 ? 'partial' : 'completed'
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status,
        completedAt: new Date(),
        recordsProcessed,
        recordsCreated,
        recordsUpdated,
        recordsFailed,
        errorMessage: errors.length > 0 ? errors.slice(0, 5).join('; ') : null,
        errorDetails: { errors, reportId },
      },
    })

    return {
      syncLogId: syncLog.id,
      reportId,
      status,
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      recordsFailed,
      errors,
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    errors.push(errorMessage)

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        recordsProcessed,
        recordsCreated,
        recordsUpdated,
        recordsFailed,
        errorMessage,
        errorDetails: { errors, reportId },
      },
    })

    return {
      syncLogId: syncLog.id,
      reportId,
      status: 'failed',
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      recordsFailed,
      errors,
      duration: Date.now() - startTime,
    }
  }
}
