import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { success, unauthorized, notFound, serverError } from '@/lib/api-response'
import type { LotDetailResponse } from '@/types/lot'
import { calculateExpiryStatus, getLotBalance } from '@/services/lot'
import { toLocalDateString } from '@/lib/utils'

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/lots/:id - Get lot details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { id } = await params

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    // Fetch lot with component relation, ensuring tenant scoping
    const lot = await prisma.lot.findFirst({
      where: {
        id,
        component: {
          companyId: selectedCompanyId,
        },
      },
      include: {
        component: {
          select: { id: true, name: true, skuCode: true },
        },
      },
    })

    if (!lot) {
      return notFound('Lot')
    }

    // Get current balance
    const balance = await getLotBalance(id, selectedCompanyId!)

    // Calculate expiry status
    const expiryStatus = calculateExpiryStatus(lot.expiryDate)

    const response: LotDetailResponse = {
      id: lot.id,
      lotNumber: lot.lotNumber,
      componentId: lot.componentId,
      componentName: lot.component.name,
      componentSkuCode: lot.component.skuCode,
      expiryDate: lot.expiryDate ? toLocalDateString(lot.expiryDate) : null,
      receivedQuantity: lot.receivedQuantity.toString(),
      balance: balance.toFixed(4),
      supplier: lot.supplier,
      status: expiryStatus,
      notes: lot.notes,
      createdAt: lot.createdAt.toISOString(),
      updatedAt: lot.updatedAt.toISOString(),
    }

    return success(response)
  } catch (error) {
    console.error('Error getting lot:', error)
    return serverError()
  }
}
