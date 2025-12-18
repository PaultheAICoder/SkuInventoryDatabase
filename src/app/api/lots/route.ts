import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { paginated, unauthorized, serverError, parseQuery } from '@/lib/api-response'
import { lotListQuerySchema } from '@/types/lot'
import type { LotResponse } from '@/types/lot'
import { calculateExpiryStatus } from '@/services/lot'
import { toLocalDateString } from '@/lib/utils'

// GET /api/lots - List lots with filtering and pagination
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { searchParams } = new URL(request.url)
    const queryResult = parseQuery(searchParams, lotListQuerySchema)
    if (queryResult.error) return queryResult.error

    const { page, pageSize, search, componentId, expiryDateFrom, expiryDateTo, status, sortBy, sortOrder } =
      queryResult.data

    // Use selected company for scoping (lots via component -> companyId)
    const selectedCompanyId = session.user.selectedCompanyId

    // Build where clause - scope by company through component relation
    const where: Prisma.LotWhereInput = {
      component: {
        companyId: selectedCompanyId,
      },
      ...(componentId && { componentId }),
      ...(search && {
        lotNumber: { contains: search, mode: 'insensitive' },
      }),
      ...(expiryDateFrom && {
        expiryDate: { gte: new Date(expiryDateFrom) },
      }),
      ...(expiryDateTo && {
        expiryDate: { lte: new Date(expiryDateTo) },
      }),
    }

    // When filtering by status, we need to:
    // 1. Fetch ALL matching lots (without pagination)
    // 2. Compute expiry status for ALL
    // 3. Filter by status
    // 4. Apply pagination to filtered set
    if (status) {
      // Fetch all lots matching other filters (no pagination)
      const allLots = await prisma.lot.findMany({
        where,
        orderBy: sortBy === 'balance'
          ? { balance: { quantity: sortOrder } }
          : { [sortBy]: sortOrder },
        include: {
          component: {
            select: { id: true, name: true, skuCode: true },
          },
          balance: {
            select: { quantity: true },
          },
        },
      })

      // Transform and compute status for ALL
      const allWithStatus: LotResponse[] = allLots.map((lot) => {
        const expiryStatus = calculateExpiryStatus(lot.expiryDate)
        return {
          id: lot.id,
          lotNumber: lot.lotNumber,
          componentId: lot.componentId,
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

      // Filter by status BEFORE pagination
      const filtered = allWithStatus.filter((l) => l.status === status)

      // Apply pagination to filtered set
      const start = (page - 1) * pageSize
      const paginatedData = filtered.slice(start, start + pageSize)

      return paginated(paginatedData, filtered.length, page, pageSize)
    }

    // Original logic for non-status queries
    const total = await prisma.lot.count({ where })

    const lots = await prisma.lot.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: sortBy === 'balance'
        ? { balance: { quantity: sortOrder } }
        : { [sortBy]: sortOrder },
      include: {
        component: {
          select: { id: true, name: true, skuCode: true },
        },
        balance: {
          select: { quantity: true },
        },
      },
    })

    // Transform response with computed fields
    const data: LotResponse[] = lots.map((lot) => {
      const expiryStatus = calculateExpiryStatus(lot.expiryDate)

      return {
        id: lot.id,
        lotNumber: lot.lotNumber,
        componentId: lot.componentId,
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

    return paginated(data, total, page, pageSize)
  } catch (error) {
    console.error('Error listing lots:', error)
    return serverError()
  }
}
