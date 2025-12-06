import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { orderListQuerySchema } from '@/types/shopify-sync'

// GET /api/shopify/orders - List synced orders (admin and ops)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Viewer role cannot access orders
    if (session.user.role === 'viewer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const searchParams = Object.fromEntries(request.nextUrl.searchParams)
    const validation = orderListQuerySchema.safeParse(searchParams)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { page, pageSize, status, search, hasUnmappedLines } = validation.data
    const selectedCompanyId = session.user.selectedCompanyId

    // Get connection for this company
    const connection = await prisma.shopifyConnection.findUnique({
      where: { companyId: selectedCompanyId },
      select: { id: true },
    })

    if (!connection) {
      return NextResponse.json({
        data: [],
        meta: { page, pageSize, total: 0, totalPages: 0 },
      })
    }

    // Build where clause
    const where: Prisma.ShopifyOrderWhereInput = {
      connectionId: connection.id,
    }

    if (status) {
      where.status = status
    }

    if (search) {
      where.OR = [
        { shopifyOrderNumber: { contains: search, mode: 'insensitive' } },
        { shopifyOrderId: { contains: search } },
      ]
    }

    // Handle hasUnmappedLines filter
    if (hasUnmappedLines !== undefined) {
      if (hasUnmappedLines) {
        where.lines = {
          some: {
            mappingStatus: { in: ['unmapped', 'not_found'] },
          },
        }
      } else {
        where.lines = {
          every: {
            mappingStatus: 'mapped',
          },
        }
      }
    }

    // Get total count
    const total = await prisma.shopifyOrder.count({ where })

    // Get orders with lines
    const orders = await prisma.shopifyOrder.findMany({
      where,
      select: {
        id: true,
        shopifyOrderId: true,
        shopifyOrderNumber: true,
        orderDate: true,
        fulfillmentStatus: true,
        financialStatus: true,
        status: true,
        errorMessage: true,
        syncedAt: true,
        processedAt: true,
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
      orderBy: { orderDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    })

    // Transform response
    const data = orders.map((order) => ({
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
      })),
    }))

    return NextResponse.json({
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    console.error('Error listing orders:', error)
    return NextResponse.json({ error: 'Failed to list orders' }, { status: 500 })
  }
}
