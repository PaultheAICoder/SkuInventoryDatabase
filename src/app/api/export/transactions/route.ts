import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { unauthorized, serverError } from '@/lib/api-response'
import {
  toCSV,
  transactionExportColumns,
  generateExportFilename,
  type TransactionExportData,
} from '@/services/export'

// GET /api/export/transactions - Export transactions to CSV
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const salesChannel = searchParams.get('salesChannel')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    // Get user's company
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { companyId: true },
    })

    if (!user) {
      // Return empty CSV
      const csv = toCSV([], transactionExportColumns)
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${generateExportFilename('transactions')}"`,
        },
      })
    }

    // Build where clause
    const where: Prisma.TransactionWhereInput = {
      companyId: user.companyId,
    }

    if (type) {
      where.type = type as Prisma.EnumTransactionTypeFilter
    }

    if (salesChannel) {
      where.salesChannel = salesChannel
    }

    if (dateFrom || dateTo) {
      where.date = {}
      if (dateFrom) {
        where.date.gte = new Date(dateFrom)
      }
      if (dateTo) {
        where.date.lte = new Date(dateTo)
      }
    }

    // Get transactions with all related data
    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        sku: {
          select: {
            name: true,
            internalCode: true,
          },
        },
        lines: {
          include: {
            component: {
              select: {
                name: true,
                skuCode: true,
              },
            },
          },
        },
        createdBy: {
          select: {
            name: true,
          },
        },
        fromLocation: {
          select: {
            name: true,
          },
        },
        toLocation: {
          select: {
            name: true,
          },
        },
      },
    })

    // Flatten transaction lines for CSV export (one row per line)
    const exportData: TransactionExportData[] = []

    for (const tx of transactions) {
      // If transaction has lines, create one row per line
      if (tx.lines.length > 0) {
        for (const line of tx.lines) {
          exportData.push({
            id: tx.id,
            type: tx.type,
            date: tx.date.toISOString().split('T')[0],
            skuName: tx.sku?.name ?? null,
            skuCode: tx.sku?.internalCode ?? null,
            salesChannel: tx.salesChannel,
            unitsBuild: tx.unitsBuild,
            unitBomCost: tx.unitBomCost?.toString() ?? null,
            totalBomCost: tx.totalBomCost?.toString() ?? null,
            supplier: tx.supplier,
            reason: tx.reason,
            notes: tx.notes,
            defectCount: tx.defectCount,
            defectNotes: tx.defectNotes,
            affectedUnits: tx.affectedUnits,
            createdAt: tx.createdAt.toISOString(),
            createdByName: tx.createdBy.name,
            fromLocationName: tx.fromLocation?.name ?? null,
            toLocationName: tx.toLocation?.name ?? null,
            componentName: line.component.name,
            componentSkuCode: line.component.skuCode,
            quantityChange: line.quantityChange.toString(),
            costPerUnit: line.costPerUnit?.toString() ?? null,
          })
        }
      } else {
        // Transaction with no lines (shouldn't happen, but handle it)
        exportData.push({
          id: tx.id,
          type: tx.type,
          date: tx.date.toISOString().split('T')[0],
          skuName: tx.sku?.name ?? null,
          skuCode: tx.sku?.internalCode ?? null,
          salesChannel: tx.salesChannel,
          unitsBuild: tx.unitsBuild,
          unitBomCost: tx.unitBomCost?.toString() ?? null,
          totalBomCost: tx.totalBomCost?.toString() ?? null,
          supplier: tx.supplier,
          reason: tx.reason,
          notes: tx.notes,
          defectCount: tx.defectCount,
          defectNotes: tx.defectNotes,
          affectedUnits: tx.affectedUnits,
          createdAt: tx.createdAt.toISOString(),
          createdByName: tx.createdBy.name,
          fromLocationName: tx.fromLocation?.name ?? null,
          toLocationName: tx.toLocation?.name ?? null,
          componentName: '',
          componentSkuCode: '',
          quantityChange: '0',
          costPerUnit: null,
        })
      }
    }

    // Generate CSV
    const csv = toCSV(exportData, transactionExportColumns)

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${generateExportFilename('transactions')}"`,
      },
    })
  } catch (error) {
    console.error('Error exporting transactions:', error)
    return serverError()
  }
}
