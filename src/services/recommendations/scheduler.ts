/**
 * Recommendation Scheduler
 *
 * Orchestrates weekly recommendation generation for all active brands.
 * Intended to run Sunday 11 PM for Monday morning availability.
 *
 * Configuration (via environment variables):
 * - DISABLE_RECOMMENDATION_SCHEDULER: Set to 'true' to disable
 * - RECOMMENDATION_SCHEDULER_DAY: Day of week (0=Sunday, default 0)
 * - RECOMMENDATION_SCHEDULER_HOUR: Hour to run (default 23)
 */

import { prisma } from '@/lib/db'
import { generateRecommendations } from './generator'
import type { ScheduledGenerationResult } from '@/types/recommendations'

// ============================================
// Configuration
// ============================================

function getConfig() {
  return {
    disabled: process.env.DISABLE_RECOMMENDATION_SCHEDULER === 'true',
    dayOfWeek: parseInt(process.env.RECOMMENDATION_SCHEDULER_DAY || '0', 10), // Sunday
    hour: parseInt(process.env.RECOMMENDATION_SCHEDULER_HOUR || '23', 10),
    timezone: process.env.RECOMMENDATION_SCHEDULER_TZ || 'America/New_York',
    staggerMs: parseInt(process.env.RECOMMENDATION_STAGGER_MS || '2000', 10),
    lookbackDays: parseInt(process.env.RECOMMENDATION_LOOKBACK_DAYS || '30', 10),
  }
}

function getCurrentDayOfWeek(): number {
  return new Date().getDay() // 0 = Sunday
}

// ============================================
// Main Scheduler Function
// ============================================

/**
 * Run scheduled recommendation generation for all active brands.
 * Called by /api/cron/recommendations at configured time (default: Sunday 11 PM).
 *
 * @param force - If true, skip day-of-week check (for manual triggering)
 */
export async function runScheduledRecommendationGeneration(
  force = false
): Promise<ScheduledGenerationResult> {
  const startTime = Date.now()
  const config = getConfig()

  // Check if disabled
  if (config.disabled) {
    console.log('[Recommendation Scheduler] Scheduler is disabled via DISABLE_RECOMMENDATION_SCHEDULER')
    return {
      totalBrands: 0,
      brandsProcessed: 0,
      brandsFailed: 0,
      results: [],
      skipped: 'disabled',
      duration: Date.now() - startTime,
    }
  }

  // Check day of week (unless forced)
  if (!force) {
    const currentDay = getCurrentDayOfWeek()
    if (currentDay !== config.dayOfWeek) {
      console.log(
        `[Recommendation Scheduler] Skipping: current day (${currentDay}) != configured day (${config.dayOfWeek})`
      )
      return {
        totalBrands: 0,
        brandsProcessed: 0,
        brandsFailed: 0,
        results: [],
        skipped: 'wrong_day',
        duration: Date.now() - startTime,
      }
    }
  }

  console.log('[Recommendation Scheduler] Starting scheduled recommendation generation...')

  // Fetch all active brands
  const brands = await prisma.brand.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
    },
  })

  console.log(`[Recommendation Scheduler] Processing ${brands.length} active brands`)

  const results: ScheduledGenerationResult['results'] = []
  let brandsProcessed = 0
  let brandsFailed = 0

  for (let i = 0; i < brands.length; i++) {
    const brand = brands[i]

    try {
      const result = await generateRecommendations({
        brandId: brand.id,
        lookbackDays: config.lookbackDays,
        dryRun: false,
      })

      results.push({
        brandId: brand.id,
        brandName: brand.name,
        generated: result.generated,
        skipped: result.skipped,
        errors: result.errors,
      })

      if (result.errors.length === 0) {
        brandsProcessed++
      } else {
        // Partial success (some errors but some generated)
        brandsProcessed++
        if (result.generated === 0 && result.errors.length > 0) {
          brandsFailed++
        }
      }

      console.log(
        `[Recommendation Scheduler] Brand ${brand.name}: ${result.generated} generated, ${result.skipped} skipped`
      )
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[Recommendation Scheduler] Error for brand ${brand.name}:`, errorMsg)

      results.push({
        brandId: brand.id,
        brandName: brand.name,
        generated: 0,
        skipped: 0,
        errors: [errorMsg],
      })

      brandsFailed++
    }

    // Stagger between brands
    if (config.staggerMs > 0 && i < brands.length - 1) {
      await new Promise(resolve => setTimeout(resolve, config.staggerMs))
    }
  }

  const duration = Date.now() - startTime
  console.log(
    `[Recommendation Scheduler] Completed: ${brandsProcessed} succeeded, ${brandsFailed} failed. Duration: ${duration}ms`
  )

  return {
    totalBrands: brands.length,
    brandsProcessed,
    brandsFailed,
    results,
    skipped: null,
    duration,
  }
}
