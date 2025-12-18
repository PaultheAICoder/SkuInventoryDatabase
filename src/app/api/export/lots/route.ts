import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { unauthorized, serverError } from '@/lib/api-response'
import { calculateExpiryStatus } from '@/services/lot'
import {
  toCSV,
  lotExportColumns,
  generateExportFilename,
  type LotExportData,
} from '@/services/export'
import { toLocalDateString } from '@/lib/utils'

// GET /api/export/lots - Export all lots to CSV
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    // Get all lots for the company (tenant scoped via component)
    const lots = await prisma.lot.findMany({
      where: {
        component: {
          companyId: selectedCompanyId,
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        component: {
          select: { name: true, skuCode: true },
        },
        balance: {
          select: { quantity: true },
        },
      },
    })

    // Transform to export format
    const exportData: LotExportData[] = lots.map((lot) => {
      const expiryStatus = calculateExpiryStatus(lot.expiryDate)

      return {
        id: lot.id,
        lotNumber: lot.lotNumber,
        componentName: lot.component.name,
        componentSkuCode: lot.component.skuCode,
        expiryDate: lot.expiryDate ? toLocalDateString(lot.expiryDate) : null,
        receivedQuantity: lot.receivedQuantity.toString(),
        balance: lot.balance?.quantity.toString() ?? '0',
        supplier: lot.supplier,
        status: expiryStatus,
        notes: lot.notes,
        createdAt: lot.createdAt.toISOString(),
      }
    })

    // Generate CSV
    const csv = toCSV(exportData, lotExportColumns)

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${generateExportFilename('lots')}"`,
      },
    })
  } catch (error) {
    console.error('Error exporting lots:', error)
    return serverError()
  }
}
