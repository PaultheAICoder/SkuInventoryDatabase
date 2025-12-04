import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { created, unauthorized, notFound, serverError, parseBody } from '@/lib/api-response'
import { receiveFinishedGoods } from '@/services/finished-goods'
import { receiveFinishedGoodsSchema } from '@/types/finished-goods'

type RouteParams = { params: Promise<{ id: string }> }

// POST /api/skus/:id/inventory/receipt - Receive finished goods (returns, corrections)
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    // Check role - Viewer cannot create transactions
    if (session.user.role === 'viewer') {
      return unauthorized('You do not have permission to receive inventory')
    }

    const { id } = await params
    const selectedCompanyId = session.user.selectedCompanyId

    const bodyResult = await parseBody(request, receiveFinishedGoodsSchema)
    if (bodyResult.error) return bodyResult.error

    const data = bodyResult.data

    // Verify SKU exists and belongs to company
    const sku = await prisma.sKU.findFirst({
      where: {
        id,
        companyId: selectedCompanyId,
      },
    })

    if (!sku) {
      return notFound('SKU')
    }

    // Validate location
    const location = await prisma.location.findFirst({
      where: {
        id: data.locationId,
        companyId: selectedCompanyId,
        isActive: true,
      },
    })

    if (!location) {
      return notFound('Location')
    }

    const result = await receiveFinishedGoods({
      companyId: selectedCompanyId,
      skuId: id,
      locationId: data.locationId,
      quantity: data.quantity,
      source: data.source,
      costPerUnit: data.costPerUnit,
      notes: data.notes,
      date: data.date,
      createdById: session.user.id,
    })

    return created({
      transactionId: result.id,
      newBalance: result.newBalance,
    })
  } catch (err) {
    console.error('Error receiving finished goods:', err)
    return serverError()
  }
}
