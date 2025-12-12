/**
 * Retention Cleanup Service
 *
 * Handles automated deletion of old records per data retention policy.
 * - KeywordMetric: 12 months
 * - SalesDaily: 12 months
 * - SyncLog: 12 months (completed), 24 months (failed)
 */

import { prisma } from '@/lib/db'

export interface RetentionCleanupResult {
  keywordMetricsDeleted: number
  salesDailyDeleted: number
  syncLogsDeleted: number
  totalDeleted: number
  duration: number
}

/**
 * Delete KeywordMetric records older than specified months
 */
export async function deleteOldKeywordMetrics(olderThanMonths: number = 12): Promise<number> {
  const cutoffDate = new Date()
  cutoffDate.setMonth(cutoffDate.getMonth() - olderThanMonths)

  const result = await prisma.keywordMetric.deleteMany({
    where: {
      createdAt: { lt: cutoffDate },
    },
  })

  return result.count
}

/**
 * Delete SalesDaily records older than specified months
 */
export async function deleteOldSalesDaily(olderThanMonths: number = 12): Promise<number> {
  const cutoffDate = new Date()
  cutoffDate.setMonth(cutoffDate.getMonth() - olderThanMonths)

  const result = await prisma.salesDaily.deleteMany({
    where: {
      createdAt: { lt: cutoffDate },
    },
  })

  return result.count
}

/**
 * Delete SyncLog records based on status:
 * - Completed/partial: 12 months
 * - Failed: 24 months (keep longer for debugging)
 */
export async function deleteOldSyncLogs(
  completedOlderThanMonths: number = 12,
  failedOlderThanMonths: number = 24
): Promise<number> {
  const completedCutoff = new Date()
  completedCutoff.setMonth(completedCutoff.getMonth() - completedOlderThanMonths)

  const failedCutoff = new Date()
  failedCutoff.setMonth(failedCutoff.getMonth() - failedOlderThanMonths)

  // Delete completed/partial sync logs older than 12 months
  const completedResult = await prisma.syncLog.deleteMany({
    where: {
      status: { in: ['completed', 'partial'] },
      startedAt: { lt: completedCutoff },
    },
  })

  // Delete failed sync logs older than 24 months
  const failedResult = await prisma.syncLog.deleteMany({
    where: {
      status: 'failed',
      startedAt: { lt: failedCutoff },
    },
  })

  return completedResult.count + failedResult.count
}

/**
 * Run full retention cleanup
 */
export async function runRetentionCleanup(): Promise<RetentionCleanupResult> {
  const startTime = Date.now()

  const keywordMetricsDeleted = await deleteOldKeywordMetrics()
  const salesDailyDeleted = await deleteOldSalesDaily()
  const syncLogsDeleted = await deleteOldSyncLogs()

  return {
    keywordMetricsDeleted,
    salesDailyDeleted,
    syncLogsDeleted,
    totalDeleted: keywordMetricsDeleted + salesDailyDeleted + syncLogsDeleted,
    duration: Date.now() - startTime,
  }
}
