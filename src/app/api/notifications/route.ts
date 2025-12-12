/**
 * Notifications API Route
 *
 * GET /api/notifications - List user notifications
 * POST /api/notifications/mark-all-read - Mark all notifications as read
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getNotificationsForUser, markAllNotificationsRead } from '@/services/notifications'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const unreadOnly = searchParams.get('unreadOnly') === 'true'
    const type = searchParams.get('type') as 'sync_failure' | 'sync_success' | 'alert' | 'info' | 'warning' | null
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit

    const result = await getNotificationsForUser({
      userId: session.user.id,
      unreadOnly,
      type: type || undefined,
      limit,
      offset,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Get notifications error:', error)
    return NextResponse.json(
      { error: 'Failed to get notifications' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action } = body as { action?: string }

    if (action === 'mark-all-read') {
      const count = await markAllNotificationsRead(session.user.id)
      return NextResponse.json({ success: true, count })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Notifications action error:', error)
    return NextResponse.json(
      { error: 'Failed to process action' },
      { status: 500 }
    )
  }
}
