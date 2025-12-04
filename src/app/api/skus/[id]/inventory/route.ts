import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { success, created, unauthorized, notFound, serverError, parseBody } from '@/lib/api-response'
import { getSkuInventorySummary, adjustFinishedGoods } from '@/services/finished-goods'
import { adjustFinishedGoodsSchema } from '@/types/finished-goods'

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/skus/:id/inventory - Get SKU finished goods inventory by location
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { id } = await params
    const selectedCompanyId = session.user.selectedCompanyId

    // Verify SKU exists and belongs to company
    const sku = await prisma.sKU.findFirst({
      where: {
        id,
        companyId: selectedCompanyId,
      },
      select: { id: true, name: true, internalCode: true },
    })

    if (!sku) {
      return notFound('SKU')
    }

    const inventory = await getSkuInventorySummary(id)

    return success({
      skuId: sku.id,
      skuName: sku.name,
      skuInternalCode: sku.internalCode,
      ...inventory,
    })
  } catch (err) {
    console.error('Error getting SKU inventory:', err)
    return serverError()
  }
}

// POST /api/skus/:id/inventory - Create finished goods adjustment
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    if (session.user.role === 'viewer') {
      return unauthorized('You do not have permission to adjust inventory')
    }

    const { id } = await params
    const selectedCompanyId = session.user.selectedCompanyId

    const bodyResult = await parseBody(request, adjustFinishedGoodsSchema)
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

    const result = await adjustFinishedGoods({
      companyId: selectedCompanyId,
      skuId: id,
      locationId: data.locationId,
      quantity: data.quantity,
      reason: data.reason,
      notes: data.notes,
      date: data.date,
      createdById: session.user.id,
    })

    return created({ transactionId: result.id })
  } catch (err) {
    console.error('Error adjusting finished goods:', err)
    return serverError()
  }
}
