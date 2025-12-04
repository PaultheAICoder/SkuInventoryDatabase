import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { syncOrders } from '@/services/shopify-sync'
import { syncRequestSchema } from '@/types/shopify-sync'

// POST /api/shopify/sync - Trigger order sync (admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const validation = syncRequestSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { createdAtMin, createdAtMax, fullSync } = validation.data

    try {
      const result = await syncOrders({
        companyId: session.user.selectedCompanyId,
        createdAtMin,
        createdAtMax,
        fullSync,
      })

      return NextResponse.json({
        data: result,
        message: `Sync completed: ${result.ordersProcessed} orders processed`,
      })
    } catch (error) {
      console.error('Sync error:', error)

      if (
        error instanceof Error &&
        error.message.includes('No active Shopify connection')
      ) {
        return NextResponse.json(
          { error: 'No active Shopify connection configured' },
          { status: 400 }
        )
      }

      return NextResponse.json(
        {
          error: 'Sync failed',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Error in sync endpoint:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
