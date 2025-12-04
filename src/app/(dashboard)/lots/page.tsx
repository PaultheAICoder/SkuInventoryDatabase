import { Suspense } from 'react'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { LotTable } from '@/components/features/LotTable'
import { ExportButton } from '@/components/features/ExportButton'
import { calculateExpiryStatus } from '@/services/lot'
import type { LotResponse, ExpiryStatus } from '@/types/lot'

interface PageProps {
  searchParams: Promise<{
    page?: string
    pageSize?: string
    search?: string
    componentId?: string
    status?: string
    sortBy?: string
    sortOrder?: string
  }>
}

async function getLots(
  selectedCompanyId: string,
  params: {
    page: number
    pageSize: number
    search?: string
    componentId?: string
    status?: ExpiryStatus
    sortBy: string
    sortOrder: 'asc' | 'desc'
  }
) {
  // Build where clause - scope by company through component relation
  const where = {
    component: {
      companyId: selectedCompanyId,
    },
    ...(params.componentId && { componentId: params.componentId }),
    ...(params.search && {
      lotNumber: { contains: params.search, mode: 'insensitive' as const },
    }),
  }

  // When filtering by status, we need to:
  // 1. Fetch ALL matching lots (without pagination)
  // 2. Compute expiry status for ALL
  // 3. Filter by status
  // 4. Apply pagination to filtered set
  if (params.status) {
    // Fetch all lots matching other filters (no pagination)
    const allLots = await prisma.lot.findMany({
      where,
      orderBy: params.sortBy === 'balance'
        ? { balance: { quantity: params.sortOrder } }
        : { [params.sortBy]: params.sortOrder },
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
        expiryDate: lot.expiryDate?.toISOString().split('T')[0] ?? null,
        receivedQuantity: lot.receivedQuantity.toString(),
        balance: lot.balance?.quantity.toString() ?? '0',
        supplier: lot.supplier,
        status: expiryStatus,
        notes: lot.notes,
        createdAt: lot.createdAt.toISOString(),
      }
    })

    // Filter by status BEFORE pagination
    const filtered = allWithStatus.filter((l) => l.status === params.status)

    // Apply pagination to filtered set
    const start = (params.page - 1) * params.pageSize
    const paginatedData = filtered.slice(start, start + params.pageSize)

    return {
      lots: paginatedData,
      total: filtered.length,
    }
  }

  // Original logic for non-status queries
  const [total, lots] = await Promise.all([
    prisma.lot.count({ where }),
    prisma.lot.findMany({
      where,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      orderBy: params.sortBy === 'balance'
        ? { balance: { quantity: params.sortOrder } }
        : { [params.sortBy]: params.sortOrder },
      include: {
        component: {
          select: { id: true, name: true, skuCode: true },
        },
        balance: {
          select: { quantity: true },
        },
      },
    }),
  ])

  // Transform response with computed fields
  const data: LotResponse[] = lots.map((lot) => {
    const expiryStatus = calculateExpiryStatus(lot.expiryDate)

    return {
      id: lot.id,
      lotNumber: lot.lotNumber,
      componentId: lot.componentId,
      componentName: lot.component.name,
      componentSkuCode: lot.component.skuCode,
      expiryDate: lot.expiryDate?.toISOString().split('T')[0] ?? null,
      receivedQuantity: lot.receivedQuantity.toString(),
      balance: lot.balance?.quantity.toString() ?? '0',
      supplier: lot.supplier,
      status: expiryStatus,
      notes: lot.notes,
      createdAt: lot.createdAt.toISOString(),
    }
  })

  return {
    lots: data,
    total,
  }
}

export default async function LotsPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    redirect('/login')
  }

  const params = await searchParams

  // Use selected company for scoping
  const selectedCompanyId = session.user.selectedCompanyId

  const page = parseInt(params.page ?? '1', 10)
  const pageSize = parseInt(params.pageSize ?? '50', 10)

  const { lots, total } = await getLots(selectedCompanyId, {
    page,
    pageSize,
    search: params.search,
    componentId: params.componentId,
    status: params.status as ExpiryStatus | undefined,
    sortBy: params.sortBy ?? 'createdAt',
    sortOrder: (params.sortOrder as 'asc' | 'desc') ?? 'desc',
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Lots</h1>
          <p className="text-muted-foreground">Track and trace component lots for recall management</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton exportType="lots" />
        </div>
      </div>

      <Suspense fallback={<div>Loading...</div>}>
        <LotTable
          lots={lots}
          total={total}
          page={page}
          pageSize={pageSize}
        />
      </Suspense>
    </div>
  )
}
