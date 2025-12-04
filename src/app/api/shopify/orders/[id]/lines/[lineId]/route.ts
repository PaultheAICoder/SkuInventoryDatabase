import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { updateLineMappingSchema } from '@/types/order-review'

// =============================================================================
// PATCH /api/shopify/orders/[id]/lines/[lineId] - Update line SKU mapping
// =============================================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admin and ops can update mappings
    if (session.user.role === 'viewer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id, lineId } = await params
    const body = await request.json()
    const validation = updateLineMappingSchema.safeParse(body)

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

    // Verify order and line exist
    const order = await prisma.shopifyOrder.findFirst({
      where: {
        id,
        connectionId: connection.id,
      },
      include: {
        lines: { where: { id: lineId } },
      },
    })

    if (!order || order.lines.length === 0) {
      return NextResponse.json({ error: 'Line not found' }, { status: 404 })
    }

    // Verify SKU exists and belongs to company
    const sku = await prisma.sKU.findFirst({
      where: {
        id: validation.data.mappedSkuId,
        companyId: selectedCompanyId,
      },
    })

    if (!sku) {
      return NextResponse.json({ error: 'SKU not found' }, { status: 404 })
    }

    // Update line mapping
    const updatedLine = await prisma.shopifyOrderLine.update({
      where: { id: lineId },
      data: {
        mappedSkuId: validation.data.mappedSkuId,
        mappingStatus: 'mapped',
      },
    })

    return NextResponse.json({
      data: updatedLine,
      message: 'Line mapping updated',
    })
  } catch (error) {
    console.error('Error updating line mapping:', error)
    return NextResponse.json({ error: 'Failed to update line mapping' }, { status: 500 })
  }
}
