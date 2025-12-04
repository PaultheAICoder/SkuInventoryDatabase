import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { z } from 'zod'

// =============================================================================
// Validation Schema
// =============================================================================

const updateOrderStatusSchema = z.object({
  status: z.enum(['pending', 'approved', 'skipped']),
})

// =============================================================================
// GET /api/shopify/orders/[id] - Get order details (admin and ops)
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Viewer role cannot access orders
    if (session.user.role === 'viewer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const selectedCompanyId = session.user.selectedCompanyId

    // Get connection for this company
    const connection = await prisma.shopifyConnection.findUnique({
      where: { companyId: selectedCompanyId },
      select: { id: true },
    })

    if (!connection) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Get order with lines and mapped SKU details
    const order = await prisma.shopifyOrder.findFirst({
      where: {
        id,
        connectionId: connection.id,
      },
      select: {
        id: true,
        shopifyOrderId: true,
        shopifyOrderNumber: true,
        orderDate: true,
        fulfillmentStatus: true,
        financialStatus: true,
        status: true,
        errorMessage: true,
        rawData: true,
        syncedAt: true,
        processedAt: true,
        transactionId: true,
        lines: {
          select: {
            id: true,
            shopifyLineId: true,
            shopifyVariantId: true,
            shopifySku: true,
            title: true,
            quantity: true,
            price: true,
            mappedSkuId: true,
            mappingStatus: true,
          },
        },
      },
    })

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Fetch mapped SKU details for lines that have mappings
    const mappedSkuIds = order.lines
      .map((l) => l.mappedSkuId)
      .filter((id): id is string => id !== null)

    const skus =
      mappedSkuIds.length > 0
        ? await prisma.sKU.findMany({
            where: { id: { in: mappedSkuIds } },
            select: { id: true, name: true, internalCode: true },
          })
        : []

    const skuMap = new Map(skus.map((s) => [s.id, s]))

    // Transform response
    const data = {
      ...order,
      orderDate: order.orderDate.toISOString(),
      syncedAt: order.syncedAt.toISOString(),
      processedAt: order.processedAt?.toISOString() || null,
      hasUnmappedLines: order.lines.some(
        (l) => l.mappingStatus === 'unmapped' || l.mappingStatus === 'not_found'
      ),
      lines: order.lines.map((line) => ({
        ...line,
        price: line.price.toString(),
        mappedSku: line.mappedSkuId ? skuMap.get(line.mappedSkuId) || null : null,
      })),
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching order:', error)
    return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 })
  }
}

// =============================================================================
// PATCH /api/shopify/orders/[id] - Update order status (admin only)
// =============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const validation = updateOrderStatusSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const selectedCompanyId = session.user.selectedCompanyId

    // Get connection for this company
    const connection = await prisma.shopifyConnection.findUnique({
      where: { companyId: selectedCompanyId },
      select: { id: true },
    })

    if (!connection) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Check if order exists and belongs to this connection
    const existingOrder = await prisma.shopifyOrder.findFirst({
      where: {
        id,
        connectionId: connection.id,
      },
    })

    if (!existingOrder) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Update order status
    const updatedOrder = await prisma.shopifyOrder.update({
      where: { id },
      data: { status: validation.data.status },
      select: {
        id: true,
        status: true,
      },
    })

    return NextResponse.json({
      data: updatedOrder,
      message: 'Order status updated',
    })
  } catch (error) {
    console.error('Error updating order:', error)
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 })
  }
}
