import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { postShopifyOrderBatch } from '@/services/order-posting'
import { postOrderBatchSchema } from '@/types/order-posting'

// =============================================================================
// POST /api/shopify/orders/post-batch - Batch post multiple approved orders
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admin and ops can post orders
    if (session.user.role === 'viewer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const selectedCompanyId = session.user.selectedCompanyId

    // Parse and validate request body
    const body = await request.json().catch(() => ({}))
    const validation = postOrderBatchSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { orderIds, allowInsufficientInventory } = validation.data

    // Verify connection exists for company
    const connection = await prisma.shopifyConnection.findUnique({
      where: { companyId: selectedCompanyId },
      select: { id: true },
    })

    if (!connection) {
      return NextResponse.json(
        { error: 'No Shopify connection found for company' },
        { status: 404 }
      )
    }

    // Verify all orders belong to this connection
    const validOrders = await prisma.shopifyOrder.findMany({
      where: {
        id: { in: orderIds },
        connectionId: connection.id,
      },
      select: { id: true },
    })

    const validOrderIds = new Set(validOrders.map((o) => o.id))
    const invalidOrderIds = orderIds.filter((id) => !validOrderIds.has(id))

    if (invalidOrderIds.length > 0) {
      return NextResponse.json(
        {
          error: 'Some orders not found',
          invalidOrderIds,
        },
        { status: 400 }
      )
    }

    // Process batch
    const result = await postShopifyOrderBatch({
      orderIds,
      userId: session.user.id,
      companyId: selectedCompanyId,
      allowInsufficientInventory,
    })

    return NextResponse.json({
      data: result,
      message: `Batch complete: ${result.successCount} succeeded, ${result.failureCount} failed`,
    })
  } catch (error) {
    console.error('Error batch posting orders:', error)
    return NextResponse.json({ error: 'Failed to batch post orders' }, { status: 500 })
  }
}
