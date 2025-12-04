import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { skipOrderSchema } from '@/types/order-review'

// =============================================================================
// POST /api/shopify/orders/[id]/skip - Skip order
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

    // Only admin and ops can skip
    if (session.user.role === 'viewer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const validation = skipOrderSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const selectedCompanyId = session.user.selectedCompanyId

    // Verify order belongs to company's connection
    const connection = await prisma.shopifyConnection.findUnique({
      where: { companyId: selectedCompanyId },
      select: { id: true },
    })

    if (!connection) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Get order
    const order = await prisma.shopifyOrder.findFirst({
      where: {
        id,
        connectionId: connection.id,
      },
    })

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Check if order can be skipped
    if (order.status === 'posted') {
      return NextResponse.json({ error: 'Cannot skip posted order' }, { status: 400 })
    }

    // Skip order (store reason in errorMessage field for now)
    const updatedOrder = await prisma.shopifyOrder.update({
      where: { id },
      data: {
        status: 'skipped',
        processedAt: new Date(),
        errorMessage: validation.data.reason || null,
      },
    })

    return NextResponse.json({
      data: { id: updatedOrder.id, status: updatedOrder.status },
      message: 'Order skipped',
    })
  } catch (error) {
    console.error('Error skipping order:', error)
    return NextResponse.json({ error: 'Failed to skip order' }, { status: 500 })
  }
}
