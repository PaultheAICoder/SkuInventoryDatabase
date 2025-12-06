import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { postShopifyOrder } from '@/services/order-posting'
import { postOrderSchema } from '@/types/order-posting'

// =============================================================================
// POST /api/shopify/orders/[id]/post - Post approved order to create transactions
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admin and ops can post orders
    if (session.user.role === 'viewer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const selectedCompanyId = session.user.selectedCompanyId

    // Parse request body
    const body = await request.json().catch(() => ({}))
    const validation = postOrderSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    // Verify order belongs to company's connection
    const connection = await prisma.shopifyConnection.findUnique({
      where: { companyId: selectedCompanyId },
      select: { id: true },
    })

    if (!connection) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Verify order exists and belongs to this connection
    const order = await prisma.shopifyOrder.findFirst({
      where: {
        id,
        connectionId: connection.id,
      },
      select: { id: true, status: true },
    })

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Post the order
    const result = await postShopifyOrder({
      orderId: id,
      userId: session.user.id,
      companyId: selectedCompanyId,
      allowInsufficientInventory: validation.data.allowInsufficientInventory,
    })

    // Determine response status based on result
    if (result.success) {
      return NextResponse.json({
        data: result,
        message: `Order posted successfully. Created ${result.transactionIds.length} transaction(s).`,
      })
    } else if (result.insufficientInventory.length > 0) {
      return NextResponse.json(
        {
          error: 'Insufficient inventory',
          data: result,
          canRetryWithOverride: true,
        },
        { status: 400 }
      )
    } else {
      return NextResponse.json(
        {
          error: result.errors[0]?.message || 'Failed to post order',
          data: result,
        },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error('Error posting order:', error)
    return NextResponse.json({ error: 'Failed to post order' }, { status: 500 })
  }
}
