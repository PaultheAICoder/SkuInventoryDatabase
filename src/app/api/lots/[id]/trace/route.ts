import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { z } from 'zod'
import { success, unauthorized, notFound, serverError, parseQuery } from '@/lib/api-response'
import type { LotTraceResponse, LotTransactionResponse, AffectedSkuResponse } from '@/types/lot'
import { getAffectedSkusForLot } from '@/services/lot'

// Query schema for trace endpoint
const traceQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
})

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/lots/:id/trace - Get transaction history and affected SKUs for a lot
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { id } = await params

    const { searchParams } = new URL(request.url)
    const queryResult = parseQuery(searchParams, traceQuerySchema)
    if (queryResult.error) return queryResult.error

    const { page, pageSize } = queryResult.data

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    // Verify lot exists and belongs to user's company
    const lot = await prisma.lot.findFirst({
      where: {
        id,
        component: {
          companyId: selectedCompanyId,
        },
      },
    })

    if (!lot) {
      return notFound('Lot')
    }

    // Get total count of transactions for this lot
    const totalTransactions = await prisma.transactionLine.count({
      where: { lotId: id },
    })

    // Get paginated transaction lines for this lot
    const transactionLines = await prisma.transactionLine.findMany({
      where: { lotId: id },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        transaction: {
          include: {
            sku: {
              select: {
                id: true,
                name: true,
                internalCode: true,
              },
            },
            location: {
              select: {
                id: true,
                name: true,
              },
            },
            createdBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        transaction: { date: 'desc' },
      },
    })

    // Transform transaction lines to response format
    const transactions: LotTransactionResponse[] = transactionLines.map((line) => ({
      id: line.transaction.id,
      date: line.transaction.date.toISOString().split('T')[0],
      type: line.transaction.type,
      quantityChange: line.quantityChange.toString(),
      skuId: line.transaction.sku?.id ?? null,
      skuName: line.transaction.sku?.name ?? null,
      skuInternalCode: line.transaction.sku?.internalCode ?? null,
      locationId: line.transaction.location?.id ?? null,
      locationName: line.transaction.location?.name ?? null,
      createdById: line.transaction.createdBy.id,
      createdByName: line.transaction.createdBy.name,
      notes: line.transaction.notes,
    }))

    // Get affected SKUs (built using this lot)
    const affectedSkus: AffectedSkuResponse[] = await getAffectedSkusForLot(id)

    const response: LotTraceResponse = {
      transactions,
      affectedSkus,
      totalTransactions,
    }

    return success(response)
  } catch (error) {
    console.error('Error tracing lot:', error)
    return serverError()
  }
}
