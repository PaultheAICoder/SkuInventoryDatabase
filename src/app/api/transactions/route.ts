import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { paginated, unauthorized, serverError, parseQuery } from '@/lib/api-response'
import { transactionListQuerySchema, TransactionResponse } from '@/types/transaction'

// GET /api/transactions - List transactions with filtering and pagination
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { searchParams } = new URL(request.url)
    const queryResult = parseQuery(searchParams, transactionListQuerySchema)
    if (queryResult.error) return queryResult.error

    const { page, pageSize, type, componentId, skuId, salesChannel, dateFrom, dateTo, sortBy, sortOrder } =
      queryResult.data

    // Build where clause
    const where: Prisma.TransactionWhereInput = {
      companyId: session.user.companyId,
      ...(type && { type }),
      ...(skuId && { skuId }),
      ...(salesChannel && { salesChannel }),
      ...(componentId && {
        lines: {
          some: { componentId },
        },
      }),
      ...(dateFrom || dateTo
        ? {
            date: {
              ...(dateFrom && { gte: dateFrom }),
              ...(dateTo && { lte: dateTo }),
            },
          }
        : {}),
    }

    // Get total count
    const total = await prisma.transaction.count({ where })

    // Get transactions
    const transactions = await prisma.transaction.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { [sortBy]: sortOrder },
      include: {
        sku: { select: { id: true, name: true } },
        bomVersion: { select: { id: true, versionName: true } },
        createdBy: { select: { id: true, name: true } },
        lines: {
          include: {
            component: { select: { id: true, name: true, skuCode: true } },
          },
        },
      },
    })

    // Transform response
    const data: TransactionResponse[] = transactions.map((tx) => ({
      id: tx.id,
      type: tx.type as TransactionResponse['type'],
      date: tx.date.toISOString().split('T')[0],
      sku: tx.sku,
      bomVersion: tx.bomVersion,
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
      createdBy: tx.createdBy,
      lines: tx.lines.map((line) => ({
        id: line.id,
        component: line.component,
        quantityChange: line.quantityChange.toString(),
        costPerUnit: line.costPerUnit?.toString() ?? null,
      })),
    }))

    return paginated(data, total, page, pageSize)
  } catch (error) {
    console.error('Error listing transactions:', error)
    return serverError()
  }
}
