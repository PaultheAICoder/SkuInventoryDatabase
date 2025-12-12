/**
 * Individual Notification API Route
 *
 * PATCH /api/notifications/[id] - Mark notification as read or dismissed
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { markNotificationRead, dismissNotification } from '@/services/notifications'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params
    const body = await request.json()
    const { action } = body as { action: 'read' | 'dismiss' }

    if (!action || !['read', 'dismiss'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Use "read" or "dismiss"' },
        { status: 400 }
      )
    }

    let success = false

    if (action === 'read') {
      success = await markNotificationRead(id, session.user.id)
    } else if (action === 'dismiss') {
      success = await dismissNotification(id, session.user.id)
    }

    if (!success) {
      return NextResponse.json(
        { error: 'Notification not found or not owned by user' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update notification error:', error)
    return NextResponse.json(
      { error: 'Failed to update notification' },
      { status: 500 }
    )
  }
}
