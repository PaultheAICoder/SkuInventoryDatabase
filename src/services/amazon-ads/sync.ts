/**
 * Amazon Ads Sync Orchestration Service
 *
 * Handles synchronization of portfolio, campaign, and ad group data
 * from Amazon Ads API to the local database.
 */

import { prisma } from '@/lib/db'
import {
  getValidAccessToken,
  getProfiles,
  getPortfolios,
  getCampaigns,
  getAdGroups,
} from './client'
import type {
  AmazonAdsPortfolio,
  AmazonAdsCampaign,
  AmazonAdsAdGroup,
  SyncResult,
} from './types'
import { syncSearchTermReport } from './reports'

export interface SyncOptions {
  credentialId: string
  syncType: 'full' | 'incremental'
  dateRange?: {
    startDate: string
    endDate: string
  }
  triggeredById?: string
}

/**
 * Main sync orchestrator - syncs all Amazon Ads data
 */
export async function syncAll(options: SyncOptions): Promise<SyncResult> {
  const startTime = Date.now()
  const errors: string[] = []
  let recordsProcessed = 0
  let recordsCreated = 0
  let recordsUpdated = 0
  let recordsFailed = 0

  // Create sync log entry
  const syncLog = await prisma.syncLog.create({
    data: {
      credentialId: options.credentialId,
      integrationType: 'amazon_ads',
      syncType: options.syncType,
      status: 'running',
      triggeredById: options.triggeredById,
    },
  })

  try {
    // Verify credential is valid
    const tokenResult = await getValidAccessToken(options.credentialId)
    if (!tokenResult.success) {
      throw new Error(tokenResult.error?.message || 'Failed to get access token')
    }

    // Get profiles to find the target profile ID
    const profilesResult = await getProfiles(options.credentialId)
    if (!profilesResult.success || !profilesResult.data || profilesResult.data.length === 0) {
      throw new Error('No advertising profiles found')
    }

    // Use US marketplace profile
    const profile = profilesResult.data.find(p => p.countryCode === 'US') || profilesResult.data[0]
    const profileId = profile.profileId.toString()

    // Sync portfolios
    const portfolioResult = await syncPortfolios(options.credentialId, profileId)
    recordsProcessed += portfolioResult.processed
    recordsCreated += portfolioResult.created
    recordsUpdated += portfolioResult.updated
    recordsFailed += portfolioResult.failed
    if (portfolioResult.errors.length > 0) {
      errors.push(...portfolioResult.errors)
    }

    // Sync campaigns
    const campaignResult = await syncCampaigns(options.credentialId, profileId)
    recordsProcessed += campaignResult.processed
    recordsCreated += campaignResult.created
    recordsUpdated += campaignResult.updated
    recordsFailed += campaignResult.failed
    if (campaignResult.errors.length > 0) {
      errors.push(...campaignResult.errors)
    }

    // Sync ad groups
    const adGroupResult = await syncAdGroups(options.credentialId, profileId)
    recordsProcessed += adGroupResult.processed
    recordsCreated += adGroupResult.created
    recordsUpdated += adGroupResult.updated
    recordsFailed += adGroupResult.failed
    if (adGroupResult.errors.length > 0) {
      errors.push(...adGroupResult.errors)
    }

    // Sync reports if date range provided
    if (options.dateRange) {
      try {
        const reportResult = await syncSearchTermReport({
          credentialId: options.credentialId,
          profileId,
          dateRange: options.dateRange,
          triggeredById: options.triggeredById,
        })

        recordsProcessed += reportResult.recordsProcessed
        recordsCreated += reportResult.recordsCreated
        recordsUpdated += reportResult.recordsUpdated
        recordsFailed += reportResult.recordsFailed

        if (reportResult.errors.length > 0) {
          errors.push(...reportResult.errors.slice(0, 5))
        }
      } catch (error) {
        errors.push(`Report sync error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    // Update sync log with success
    const status = errors.length > 0 ? 'partial' : 'completed'
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status,
        completedAt: new Date(),
        recordsProcessed,
        recordsCreated,
        recordsUpdated,
        recordsFailed,
        errorMessage: errors.length > 0 ? errors.slice(0, 5).join('; ') : null,
        errorDetails: { errors },
      },
    })

    // Update credential last used
    await prisma.integrationCredential.update({
      where: { id: options.credentialId },
      data: {
        lastUsedAt: new Date(),
        lastError: null,
        lastErrorAt: null,
      },
    })

    return {
      syncLogId: syncLog.id,
      status,
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      recordsFailed,
      errors,
      duration: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    errors.push(errorMessage)

    // Update sync log with failure
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        recordsProcessed,
        recordsCreated,
        recordsUpdated,
        recordsFailed,
        errorMessage,
        errorDetails: { errors },
      },
    })

    // Update credential with error
    await prisma.integrationCredential.update({
      where: { id: options.credentialId },
      data: {
        lastErrorAt: new Date(),
        lastError: errorMessage,
      },
    })

    // Create notification for sync failure
    const credential = await prisma.integrationCredential.findUnique({
      where: { id: options.credentialId },
      include: { company: { include: { userCompanies: { where: { isPrimary: true }, include: { user: true } } } } },
    })

    if (credential?.company?.userCompanies) {
      const adminUsers = credential.company.userCompanies.filter(uc =>
        uc.role === 'admin' || uc.isPrimary
      )

      for (const uc of adminUsers) {
        await prisma.notification.create({
          data: {
            userId: uc.userId,
            type: 'sync_failure',
            title: 'Amazon Ads Sync Failed',
            message: `Sync failed: ${errorMessage}. Please check your connection.`,
            relatedType: 'sync_log',
            relatedId: syncLog.id,
          },
        })
      }
    }

    return {
      syncLogId: syncLog.id,
      status: 'failed',
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      recordsFailed,
      errors,
      duration: Date.now() - startTime,
    }
  }
}

interface BatchResult {
  processed: number
  created: number
  updated: number
  failed: number
  errors: string[]
}

/**
 * Sync portfolios from Amazon Ads
 */
export async function syncPortfolios(
  credentialId: string,
  profileId: string
): Promise<BatchResult> {
  const result: BatchResult = { processed: 0, created: 0, updated: 0, failed: 0, errors: [] }

  const portfoliosResult = await getPortfolios(credentialId, profileId)

  if (!portfoliosResult.success || !portfoliosResult.data) {
    result.errors.push(portfoliosResult.error?.message || 'Failed to fetch portfolios')
    return result
  }

  for (const portfolio of portfoliosResult.data) {
    result.processed++
    try {
      await upsertPortfolio(credentialId, portfolio)
      result.created++ // upsert counts as created for simplicity
    } catch (error) {
      result.failed++
      result.errors.push(`Portfolio ${portfolio.portfolioId}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  return result
}

async function upsertPortfolio(credentialId: string, portfolio: AmazonAdsPortfolio): Promise<void> {
  await prisma.adPortfolio.upsert({
    where: {
      credentialId_externalId: {
        credentialId,
        externalId: portfolio.portfolioId.toString(),
      },
    },
    create: {
      credentialId,
      externalId: portfolio.portfolioId.toString(),
      name: portfolio.name,
      state: portfolio.state,
      budgetAmount: portfolio.budget?.amount,
      budgetCurrencyCode: portfolio.budget?.currencyCode,
      budgetPolicy: portfolio.budget?.policy,
    },
    update: {
      name: portfolio.name,
      state: portfolio.state,
      budgetAmount: portfolio.budget?.amount,
      budgetCurrencyCode: portfolio.budget?.currencyCode,
      budgetPolicy: portfolio.budget?.policy,
    },
  })
}

/**
 * Sync campaigns from Amazon Ads
 */
export async function syncCampaigns(
  credentialId: string,
  profileId: string
): Promise<BatchResult> {
  const result: BatchResult = { processed: 0, created: 0, updated: 0, failed: 0, errors: [] }

  const campaignsResult = await getCampaigns(credentialId, profileId)

  if (!campaignsResult.success || !campaignsResult.data) {
    result.errors.push(campaignsResult.error?.message || 'Failed to fetch campaigns')
    return result
  }

  for (const campaign of campaignsResult.data) {
    result.processed++
    try {
      await upsertCampaign(credentialId, campaign)
      result.created++
    } catch (error) {
      result.failed++
      result.errors.push(`Campaign ${campaign.campaignId}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  return result
}

async function upsertCampaign(credentialId: string, campaign: AmazonAdsCampaign): Promise<void> {
  // Find portfolio if exists
  let portfolioId: string | null = null
  if (campaign.portfolioId) {
    const portfolio = await prisma.adPortfolio.findFirst({
      where: {
        credentialId,
        externalId: campaign.portfolioId.toString(),
      },
    })
    portfolioId = portfolio?.id || null
  }

  await prisma.adCampaign.upsert({
    where: {
      credentialId_externalId: {
        credentialId,
        externalId: campaign.campaignId.toString(),
      },
    },
    create: {
      credentialId,
      portfolioId,
      externalId: campaign.campaignId.toString(),
      name: campaign.name,
      campaignType: campaign.campaignType,
      targetingType: campaign.targetingType,
      state: campaign.state,
      dailyBudget: campaign.dailyBudget,
      startDate: campaign.startDate ? new Date(campaign.startDate) : null,
      endDate: campaign.endDate ? new Date(campaign.endDate) : null,
    },
    update: {
      portfolioId,
      name: campaign.name,
      campaignType: campaign.campaignType,
      targetingType: campaign.targetingType,
      state: campaign.state,
      dailyBudget: campaign.dailyBudget,
      startDate: campaign.startDate ? new Date(campaign.startDate) : null,
      endDate: campaign.endDate ? new Date(campaign.endDate) : null,
    },
  })
}

/**
 * Sync ad groups from Amazon Ads
 */
export async function syncAdGroups(
  credentialId: string,
  profileId: string
): Promise<BatchResult> {
  const result: BatchResult = { processed: 0, created: 0, updated: 0, failed: 0, errors: [] }

  const adGroupsResult = await getAdGroups(credentialId, profileId)

  if (!adGroupsResult.success || !adGroupsResult.data) {
    result.errors.push(adGroupsResult.error?.message || 'Failed to fetch ad groups')
    return result
  }

  for (const adGroup of adGroupsResult.data) {
    result.processed++
    try {
      await upsertAdGroup(credentialId, adGroup)
      result.created++
    } catch (error) {
      result.failed++
      result.errors.push(`AdGroup ${adGroup.adGroupId}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  return result
}

async function upsertAdGroup(credentialId: string, adGroup: AmazonAdsAdGroup): Promise<void> {
  // Find campaign
  const campaign = await prisma.adCampaign.findFirst({
    where: {
      credentialId,
      externalId: adGroup.campaignId.toString(),
    },
  })

  if (!campaign) {
    throw new Error(`Campaign ${adGroup.campaignId} not found`)
  }

  await prisma.adGroup.upsert({
    where: {
      campaignId_externalId: {
        campaignId: campaign.id,
        externalId: adGroup.adGroupId.toString(),
      },
    },
    create: {
      campaignId: campaign.id,
      externalId: adGroup.adGroupId.toString(),
      name: adGroup.name,
      state: adGroup.state,
      defaultBid: adGroup.defaultBid,
    },
    update: {
      name: adGroup.name,
      state: adGroup.state,
      defaultBid: adGroup.defaultBid,
    },
  })
}

/**
 * Trigger sync for all active Amazon Ads credentials
 * Used by cron job
 */
export async function syncAllActiveCredentials(): Promise<{
  syncsTriggered: number
  credentials: string[]
  errors: string[]
}> {
  const credentials = await prisma.integrationCredential.findMany({
    where: {
      integrationType: 'amazon_ads',
      status: 'active',
    },
    select: { id: true },
  })

  const errors: string[] = []
  const triggeredIds: string[] = []

  for (const cred of credentials) {
    try {
      // Start sync in background (don't await)
      syncAll({
        credentialId: cred.id,
        syncType: 'incremental',
      }).catch(err => {
        console.error(`Background sync failed for ${cred.id}:`, err)
      })

      triggeredIds.push(cred.id)
    } catch (error) {
      errors.push(`${cred.id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  return {
    syncsTriggered: triggeredIds.length,
    credentials: triggeredIds,
    errors,
  }
}
