import { toCSV, type CSVColumn } from './export'
import type { DefectAnalyticsExportRow } from '@/types/analytics'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { DefectAnalyticsQuery } from '@/types/analytics'
import { toLocalDateString } from '@/lib/utils'

/**
 * Column definitions for defect analytics export
 */
export const defectAnalyticsExportColumns: CSVColumn<DefectAnalyticsExportRow>[] = [
  { header: 'Date', accessor: (r) => r.date },
  { header: 'SKU Name', accessor: (r) => r.skuName },
  { header: 'SKU Code', accessor: (r) => r.skuCode },
  { header: 'BOM Version', accessor: (r) => r.bomVersionName },
  { header: 'Sales Channel', accessor: (r) => r.salesChannel },
  { header: 'Units Built', accessor: (r) => r.unitsBuilt },
  { header: 'Defect Count', accessor: (r) => r.defectCount },
  { header: 'Affected Units', accessor: (r) => r.affectedUnits },
  { header: 'Defect Rate (%)', accessor: (r) => r.defectRate },
  { header: 'Defect Notes', accessor: (r) => r.defectNotes },
]

/**
 * Generate CSV data for defect analytics export
 */
export async function generateDefectAnalyticsExport(
  companyId: string,
  query: DefectAnalyticsQuery
): Promise<string> {
  const { dateFrom, dateTo, skuId, bomVersionId, salesChannel } = query

  // Build where clause
  const where: Prisma.TransactionWhereInput = {
    companyId,
    type: 'build',
    unitsBuild: { gt: 0 },
    ...(dateFrom || dateTo
      ? {
          date: {
            ...(dateFrom && { gte: dateFrom }),
            ...(dateTo && { lte: dateTo }),
          },
        }
      : {}),
    ...(skuId && { skuId }),
    ...(bomVersionId && { bomVersionId }),
    ...(salesChannel && { salesChannel }),
  }

  const transactions = await prisma.transaction.findMany({
    where,
    select: {
      date: true,
      unitsBuild: true,
      defectCount: true,
      affectedUnits: true,
      defectNotes: true,
      salesChannel: true,
      sku: {
        select: {
          name: true,
          internalCode: true,
        },
      },
      bomVersion: {
        select: {
          versionName: true,
        },
      },
    },
    orderBy: { date: 'desc' },
  })

  const rows: DefectAnalyticsExportRow[] = transactions.map((tx) => {
    const unitsBuilt = tx.unitsBuild ?? 0
    const defectCount = tx.defectCount ?? 0
    const defectRate = unitsBuilt > 0 ? (defectCount / unitsBuilt) * 100 : 0

    return {
      date: toLocalDateString(tx.date),
      skuName: tx.sku?.name ?? 'N/A',
      skuCode: tx.sku?.internalCode ?? 'N/A',
      bomVersionName: tx.bomVersion?.versionName ?? 'N/A',
      salesChannel: tx.salesChannel,
      unitsBuilt,
      defectCount,
      affectedUnits: tx.affectedUnits ?? 0,
      defectRate: defectRate.toFixed(2),
      defectNotes: tx.defectNotes,
    }
  })

  return toCSV(rows, defectAnalyticsExportColumns)
}

/**
 * Generate filename for defect analytics export
 */
export function generateDefectAnalyticsFilename(): string {
  const date = toLocalDateString(new Date())
  return `defect-analytics-${date}.csv`
}
