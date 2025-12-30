import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// =============================================================================
// POST /api/shopify/orders/[id]/approve - Approve order for transaction posting
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Mark request as used to avoid unused parameter warning
  void request

  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admin and ops can approve
    if (session.user.role === 'viewer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const selectedCompanyId = session.user.selectedCompanyId

    // Verify order belongs to company's connection
    const connection = await prisma.shopifyConnection.findUnique({
      where: { companyId: selectedCompanyId },
      select: { id: true },
    })

    if (!connection) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Get order with lines
    const order = await prisma.shopifyOrder.findFirst({
      where: {
        id,
        connectionId: connection.id,
      },
      include: {
        lines: true,
      },
    })

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Check if order can be approved (not already posted/approved)
    if (order.status === 'posted') {
      return NextResponse.json({ error: 'Order already posted' }, { status: 400 })
    }

    if (order.status === 'approved') {
      return NextResponse.json({ error: 'Order already approved' }, { status: 400 })
    }

    // Validate all lines with variant IDs are mapped
    const unmappedLines = order.lines.filter(
      (line) => line.shopifyVariantId && line.mappingStatus !== 'mapped'
    )

    if (unmappedLines.length > 0) {
      return NextResponse.json(
        {
          error: 'Cannot approve order with unmapped lines',
          details: {
            unmappedCount: unmappedLines.length,
            unmappedLines: unmappedLines.map((l) => ({
              id: l.id,
              title: l.title,
              shopifySku: l.shopifySku,
            })),
          },
        },
        { status: 400 }
      )
    }

    // Approve order
    const updatedOrder = await prisma.shopifyOrder.update({
      where: { id },
      data: {
        status: 'approved',
        processedAt: new Date(),
      },
    })

    return NextResponse.json({
      data: { id: updatedOrder.id, status: updatedOrder.status },
      message: 'Order approved',
    })
  } catch (error) {
    console.error('Error approving order:', error)
    return NextResponse.json({ error: 'Failed to approve order' }, { status: 500 })
  }
}
