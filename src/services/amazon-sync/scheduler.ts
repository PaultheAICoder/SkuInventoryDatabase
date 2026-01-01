/**
 * Amazon Data Sync Scheduler
 *
 * Orchestrates daily synchronization of Amazon data:
 * - Amazon Ads: portfolios, campaigns, ad groups, reports
 * - Amazon SP: orders (via SP-API)
 *
 * Features:
 * - Retry logic for transient failures
 * - Staggered execution to avoid rate limits
 * - Weekend skip option
 * - Configurable via environment variables
 */

import { prisma } from '@/lib/db'
import { syncAll as syncAmazonAds } from '@/services/amazon-ads/sync'
import { syncOrders, type OrderSyncOptions } from '@/services/amazon-sp-api/sync-orders'
import { format, subDays } from 'date-fns'
import type { SyncOptions as AdsSyncOptions, SyncResult as AdsSyncResult } from '@/services/amazon-ads/types'
import type { OrderSyncResult } from '@/services/amazon-sp-api/types'

// ============================================
// Types
// ============================================

export interface ScheduledSyncResult {
  totalCredentials: number
  syncsTriggered: number
  syncsCompleted: number
  syncsFailed: number
  amazonAdsResults: CredentialSyncResult[]
  amazonSpResults: CredentialSyncResult[]
  skipped: SkipReason | null
  duration: number
}

export interface CredentialSyncResult {
  credentialId: string
  integrationType: 'amazon_ads' | 'amazon_sp'
  status: 'completed' | 'partial' | 'failed' | 'skipped'
  syncLogId?: string
  error?: string
  retryCount: number
}

export type SkipReason = 'disabled' | 'weekend'

// ============================================
// Configuration
// ============================================

function getConfig() {
  return {
    disabled: process.env.DISABLE_AMAZON_SYNC === 'true',
    skipWeekends: process.env.SKIP_WEEKENDS === 'true',
    timezone: process.env.SYNC_TIMEZONE || 'America/New_York',
    staggerMs: parseInt(process.env.SYNC_STAGGER_MS || '5000', 10),
    maxRetries: parseInt(process.env.SYNC_MAX_RETRIES || '3', 10),
  }
}

function isWeekend(): boolean {
  const now = new Date()
  const day = now.getDay()
  return day === 0 || day === 6 // Sunday = 0, Saturday = 6
}

function getYesterdayDateRange(): { startDate: string; endDate: string } {
  const yesterday = subDays(new Date(), 1)
  const dateStr = format(yesterday, 'yyyy-MM-dd')
  return { startDate: dateStr, endDate: dateStr }
}

// ============================================
// Retry Logic
// ============================================

async function syncWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number,
  credentialId: string,
  integrationType: string
): Promise<{ result?: T; error?: string; retryCount: number }> {
  let lastError: string | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation()
      return { result, retryCount: attempt }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error'
      console.error(
        `[Amazon Sync] Attempt ${attempt + 1}/${maxRetries + 1} failed for ${integrationType} ${credentialId}: ${lastError}`
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
// Stagger Helper
// ============================================

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================
// Main Scheduler Function
// ============================================

/**
 * Run scheduled sync for all active Amazon credentials
 * Called by /api/cron/ads-sync at 5 AM daily
 */
export async function runScheduledAmazonSync(): Promise<ScheduledSyncResult> {
  const startTime = Date.now()
  const config = getConfig()

  // Check if disabled
  if (config.disabled) {
    console.log('[Amazon Sync] Sync is disabled via DISABLE_AMAZON_SYNC')
    return {
      totalCredentials: 0,
      syncsTriggered: 0,
      syncsCompleted: 0,
      syncsFailed: 0,
      amazonAdsResults: [],
      amazonSpResults: [],
      skipped: 'disabled',
      duration: Date.now() - startTime,
    }
  }

  // Check weekend skip
  if (config.skipWeekends && isWeekend()) {
    console.log('[Amazon Sync] Skipping sync on weekend (SKIP_WEEKENDS=true)')
    return {
      totalCredentials: 0,
      syncsTriggered: 0,
      syncsCompleted: 0,
      syncsFailed: 0,
      amazonAdsResults: [],
      amazonSpResults: [],
      skipped: 'weekend',
      duration: Date.now() - startTime,
    }
  }

  console.log('[Amazon Sync] Starting scheduled sync...')

  // Fetch all active Amazon credentials
  const credentials = await prisma.integrationCredential.findMany({
    where: {
      integrationType: { in: ['amazon_ads', 'amazon_sp'] },
      status: 'active',
    },
    select: {
      id: true,
      integrationType: true,
      brandId: true,
      companyId: true,
    },
  })

  const amazonAdsResults: CredentialSyncResult[] = []
  const amazonSpResults: CredentialSyncResult[] = []
  let syncsCompleted = 0
  let syncsFailed = 0

  const dateRange = getYesterdayDateRange()

  // Process Amazon Ads credentials
  const adsCredentials = credentials.filter(c => c.integrationType === 'amazon_ads')
  console.log(`[Amazon Sync] Processing ${adsCredentials.length} Amazon Ads credentials`)

  for (let i = 0; i < adsCredentials.length; i++) {
    const credential = adsCredentials[i]
    const options: AdsSyncOptions = {
      credentialId: credential.id,
      syncType: 'full',
      dateRange,
    }

    const { result, error, retryCount } = await syncWithRetry<AdsSyncResult>(
      () => syncAmazonAds(options),
      config.maxRetries,
      credential.id,
      'amazon_ads'
    )

    if (result) {
      amazonAdsResults.push({
        credentialId: credential.id,
        integrationType: 'amazon_ads',
        status: result.status,
        syncLogId: result.syncLogId,
        retryCount,
      })
      if (result.status === 'completed' || result.status === 'partial') {
        syncsCompleted++
      } else {
        syncsFailed++
      }
    } else {
      amazonAdsResults.push({
        credentialId: credential.id,
        integrationType: 'amazon_ads',
        status: 'failed',
        error,
        retryCount,
      })
      syncsFailed++
    }

    // Stagger between credentials
    if (config.staggerMs > 0 && i < adsCredentials.length - 1) {
      await delay(config.staggerMs)
    }
  }

  // Process Amazon SP credentials (orders)
  const spCredentials = credentials.filter(c => c.integrationType === 'amazon_sp')
  console.log(`[Amazon Sync] Processing ${spCredentials.length} Amazon SP credentials`)

  for (let i = 0; i < spCredentials.length; i++) {
    const credential = spCredentials[i]

    // SP-API orders sync requires brandId
    if (!credential.brandId) {
      console.warn(`[Amazon Sync] Skipping amazon_sp ${credential.id}: no brandId configured`)
      amazonSpResults.push({
        credentialId: credential.id,
        integrationType: 'amazon_sp',
        status: 'skipped',
        error: 'No brandId configured for credential',
        retryCount: 0,
      })
      continue
    }

    const options: OrderSyncOptions = {
      credentialId: credential.id,
      brandId: credential.brandId,
      dateRange,
    }

    const { result, error, retryCount } = await syncWithRetry<OrderSyncResult>(
      () => syncOrders(options),
      config.maxRetries,
      credential.id,
      'amazon_sp'
    )

    if (result) {
      amazonSpResults.push({
        credentialId: credential.id,
        integrationType: 'amazon_sp',
        status: result.status,
        syncLogId: result.syncLogId,
        retryCount,
      })
      if (result.status === 'completed' || result.status === 'partial') {
        syncsCompleted++
      } else {
        syncsFailed++
      }
    } else {
      amazonSpResults.push({
        credentialId: credential.id,
        integrationType: 'amazon_sp',
        status: 'failed',
        error,
        retryCount,
      })
      syncsFailed++
    }

    // Stagger between credentials
    if (config.staggerMs > 0 && i < spCredentials.length - 1) {
      await delay(config.staggerMs)
    }
  }

  const duration = Date.now() - startTime
  console.log(
    `[Amazon Sync] Completed: ${syncsCompleted} succeeded, ${syncsFailed} failed, ` +
    `${amazonSpResults.filter(r => r.status === 'skipped').length} skipped. ` +
    `Duration: ${duration}ms`
  )

  return {
    totalCredentials: credentials.length,
    syncsTriggered: credentials.length,
    syncsCompleted,
    syncsFailed,
    amazonAdsResults,
    amazonSpResults,
    skipped: null,
    duration,
  }
}
