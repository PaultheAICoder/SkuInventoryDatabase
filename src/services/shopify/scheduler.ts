/**
 * Shopify Order Sync Scheduler
 *
 * Orchestrates daily synchronization of Shopify orders.
 * Called by /api/cron/shopify-sync at scheduled intervals.
 *
 * Features:
 * - Syncs all active Shopify connections
 * - Retry logic for transient failures
 * - Weekend skip option (optional)
 * - Configurable via environment variables
 */

import { prisma } from '@/lib/db'
import { syncAll } from '@/services/shopify/sync'
import { format, subDays } from 'date-fns'

// ============================================
// Types
// ============================================

export interface ShopifySyncResult {
  totalConnections: number
  syncsTriggered: number
  syncsCompleted: number
  syncsFailed: number
  results: ConnectionSyncResult[]
  skipped: SkipReason | null
  duration: number
}

export interface ConnectionSyncResult {
  connectionId: string
  shopName: string
  status: 'completed' | 'partial' | 'failed' | 'skipped'
  ordersProcessed?: number
  ordersCreated?: number
  ordersUpdated?: number
  error?: string
  retryCount: number
}

export type SkipReason = 'disabled' | 'weekend'

// ============================================
// Configuration
// ============================================

function getConfig() {
  return {
    disabled: process.env.DISABLE_SHOPIFY_SYNC === 'true',
    skipWeekends: process.env.SKIP_SHOPIFY_WEEKENDS === 'true',
    staggerMs: parseInt(process.env.SHOPIFY_SYNC_STAGGER_MS || '3000', 10),
    maxRetries: parseInt(process.env.SHOPIFY_SYNC_MAX_RETRIES || '3', 10),
  }
}

function isWeekend(): boolean {
  const now = new Date()
  const day = now.getDay()
  return day === 0 || day === 6 // Sunday = 0, Saturday = 6
}

function getDefaultDateRange(): { startDate: string; endDate: string } {
  const yesterday = subDays(new Date(), 1)
  const dateStr = format(yesterday, 'yyyy-MM-dd')
  return { startDate: dateStr, endDate: dateStr }
}

// ============================================
// Retry Logic
// ============================================

async function syncWithRetry(
  connectionId: string,
  shopName: string,
  dateRange: { startDate: string; endDate: string },
  maxRetries: number
): Promise<{ result?: Awaited<ReturnType<typeof syncAll>>; error?: string; retryCount: number }> {
  let lastError: string | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await syncAll({
        connectionId,
        dateRange,
      })
      return { result, retryCount: attempt }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error'
      console.error(
        `[Shopify Sync] Attempt ${attempt + 1}/${maxRetries + 1} failed for ${shopName}: ${lastError}`
      )

      if (attempt < maxRetries) {
        // Exponential backoff: 2^attempt * 1000ms (1s, 2s, 4s, 8s...)
        const backoffMs = Math.pow(2, attempt) * 1000
        await new Promise(resolve => setTimeout(resolve, backoffMs))
      }
    }
  }

  return { error: lastError, retryCount: maxRetries }
}

// ============================================
// Main Scheduler Function
// ============================================

/**
 * Run scheduled sync for all active Shopify connections
 * Called by /api/cron/shopify-sync daily
 */
export async function runScheduledShopifySync(): Promise<ShopifySyncResult> {
  const startTime = Date.now()
  const config = getConfig()

  // Check if disabled
  if (config.disabled) {
    console.log('[Shopify Sync] Sync is disabled via DISABLE_SHOPIFY_SYNC')
    return {
      totalConnections: 0,
      syncsTriggered: 0,
      syncsCompleted: 0,
      syncsFailed: 0,
      results: [],
      skipped: 'disabled',
      duration: Date.now() - startTime,
    }
  }

  // Check weekend skip
  if (config.skipWeekends && isWeekend()) {
    console.log('[Shopify Sync] Skipping sync on weekend (SKIP_SHOPIFY_WEEKENDS=true)')
    return {
      totalConnections: 0,
      syncsTriggered: 0,
      syncsCompleted: 0,
      syncsFailed: 0,
      results: [],
      skipped: 'weekend',
      duration: Date.now() - startTime,
    }
  }

  console.log('[Shopify Sync] Starting scheduled sync...')

  // Fetch all active Shopify connections
  const connections = await prisma.shopifyConnection.findMany({
    where: { isActive: true },
    select: {
      id: true,
      shopName: true,
      companyId: true,
    },
  })

  const results: ConnectionSyncResult[] = []
  let syncsCompleted = 0
  let syncsFailed = 0

  const dateRange = getDefaultDateRange()

  console.log(`[Shopify Sync] Processing ${connections.length} active connections`)

  for (let i = 0; i < connections.length; i++) {
    const connection = connections[i]

    const { result, error, retryCount } = await syncWithRetry(
      connection.id,
      connection.shopName,
      dateRange,
      config.maxRetries
    )

    if (result) {
      results.push({
        connectionId: connection.id,
        shopName: connection.shopName,
        status: result.success ? 'completed' : 'partial',
        ordersProcessed: result.ordersProcessed,
        ordersCreated: result.ordersCreated,
        ordersUpdated: result.ordersUpdated,
        retryCount,
      })
      syncsCompleted++
    } else {
      results.push({
        connectionId: connection.id,
        shopName: connection.shopName,
        status: 'failed',
        error,
        retryCount,
      })
      syncsFailed++
    }

    // Stagger between connections to avoid rate limiting
    if (config.staggerMs > 0 && i < connections.length - 1) {
      await new Promise(resolve => setTimeout(resolve, config.staggerMs))
    }
  }

  const duration = Date.now() - startTime
  console.log(
    `[Shopify Sync] Completed: ${syncsCompleted} succeeded, ${syncsFailed} failed. Duration: ${duration}ms`
  )

  return {
    totalConnections: connections.length,
    syncsTriggered: connections.length,
    syncsCompleted,
    syncsFailed,
    results,
    skipped: null,
    duration,
  }
}
