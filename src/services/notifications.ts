/**
 * Notification Service
 *
 * Manages in-app notifications for sync failures, alerts, and system messages.
 */

import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

export type NotificationType = 'sync_failure' | 'sync_success' | 'alert' | 'info' | 'warning'

export interface CreateNotificationParams {
  userId: string
  type: NotificationType
  title: string
  message: string
  relatedType?: string // 'sync_log', 'credential', etc.
  relatedId?: string
}

export interface NotificationFilters {
  userId: string
  unreadOnly?: boolean
  type?: NotificationType
  limit?: number
  offset?: number
}

/**
 * Create a new notification for a user
 */
export async function createNotification(params: CreateNotificationParams): Promise<string> {
  const { userId, type, title, message, relatedType, relatedId } = params

  const notification = await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      message,
      relatedType,
      relatedId,
      read: false,
    },
  })

  return notification.id
}

/**
 * Create notifications for multiple users (e.g., all admins)
 */
export async function createNotificationForUsers(
  userIds: string[],
  params: Omit<CreateNotificationParams, 'userId'>
): Promise<number> {
  const { type, title, message, relatedType, relatedId } = params

  const result = await prisma.notification.createMany({
    data: userIds.map(userId => ({
      userId,
      type,
      title,
      message,
      relatedType,
      relatedId,
      read: false,
    })),
  })

  return result.count
}

/**
 * Create sync failure notification for company admins
 */
export async function createSyncFailureNotification(params: {
  companyId: string
  integrationType: string
  errorMessage: string
  syncLogId?: string
}): Promise<number> {
  const { companyId, integrationType, errorMessage, syncLogId } = params

  // Get all admins for the company
  const admins = await prisma.userCompany.findMany({
    where: {
      companyId,
      role: 'admin',
    },
    select: { userId: true },
  })

  if (admins.length === 0) return 0

  const integrationName = integrationType === 'amazon_ads' ? 'Amazon Ads' :
                          integrationType === 'shopify' ? 'Shopify' :
                          integrationType

  return createNotificationForUsers(
    admins.map(a => a.userId),
    {
      type: 'sync_failure',
      title: `${integrationName} Sync Failed`,
      message: errorMessage.slice(0, 500), // Limit message length
      relatedType: syncLogId ? 'sync_log' : undefined,
      relatedId: syncLogId,
    }
  )
}

/**
 * Mark a notification as read
 */
export async function markNotificationRead(notificationId: string, userId: string): Promise<boolean> {
  const result = await prisma.notification.updateMany({
    where: {
      id: notificationId,
      userId, // Ensure user owns the notification
    },
    data: {
      read: true,
      readAt: new Date(),
    },
  })

  return result.count > 0
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: {
      userId,
      read: false,
    },
    data: {
      read: true,
      readAt: new Date(),
    },
  })

  return result.count
}

/**
 * Dismiss (soft delete) a notification
 */
export async function dismissNotification(notificationId: string, userId: string): Promise<boolean> {
  const result = await prisma.notification.updateMany({
    where: {
      id: notificationId,
      userId,
    },
    data: {
      dismissedAt: new Date(),
    },
  })

  return result.count > 0
}

/**
 * Get notifications for a user
 */
export async function getNotificationsForUser(filters: NotificationFilters) {
  const { userId, unreadOnly = false, type, limit = 50, offset = 0 } = filters

  const where: Prisma.NotificationWhereInput = {
    userId,
    dismissedAt: null, // Don't show dismissed notifications
    ...(unreadOnly && { read: false }),
    ...(type && { type }),
  }

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({
      where: {
        userId,
        read: false,
        dismissedAt: null,
      },
    }),
  ])

  return {
    notifications,
    total,
    unreadCount,
    page: Math.floor(offset / limit) + 1,
    pageSize: limit,
  }
}

/**
 * Get unread notification count for a user
 */
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: {
      userId,
      read: false,
      dismissedAt: null,
    },
  })
}

/**
 * Delete old notifications (for cleanup)
 */
export async function deleteOldNotifications(olderThanDays: number = 90): Promise<number> {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

  const result = await prisma.notification.deleteMany({
    where: {
      createdAt: { lt: cutoffDate },
      // Only delete read or dismissed notifications
      OR: [
        { read: true },
        { dismissedAt: { not: null } },
      ],
    },
  })

  return result.count
}
