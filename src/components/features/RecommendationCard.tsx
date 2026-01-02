'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  DollarSign,
  Target,
  CheckCircle,
  XCircle,
  PauseCircle,
} from 'lucide-react'
import type { RecommendationWithRelations, RecommendationType } from '@/types/recommendations'
import {
  getRecommendationTypeLabel,
  getConfidenceLevelLabel,
  calculateImprovementPercentage,
} from '@/lib/recommendation-utils'
import { AcceptRejectModal } from './AcceptRejectModal'

/**
 * Campaign occurrence data for duplicate keyword display
 */
interface CampaignOccurrence {
  campaignId: string
  campaignName: string
  matchType: string
  spend: number
  orders: number
  acos: number
}

/**
 * Extract campaign occurrences from recommendation metadata
 */
function getCampaignOccurrences(metadata: Record<string, unknown> | null): CampaignOccurrence[] {
  if (!metadata || !metadata.occurrences) return []
  return metadata.occurrences as CampaignOccurrence[]
}

/**
 * Metadata structure for negative keyword recommendations
 */
interface NegativeKeywordMetadata {
  campaigns: string[]
  campaignIds: string[]
  totalSpend: number
  totalClicks: number
  totalImpressions: number
}

/**
 * Extract negative keyword metadata from recommendation
 */
function getNegativeKeywordMetadata(metadata: Record<string, unknown> | null): NegativeKeywordMetadata | null {
  if (!metadata || !metadata.campaigns) return null
  return metadata as unknown as NegativeKeywordMetadata
}

/**
 * Metadata structure for budget increase recommendations
 */
interface BudgetIncreaseMetadata {
  campaignName: string
  currentDailyBudget: number
  suggestedDailyBudget: number
  budgetUtilization: number
  currentAcos: number
  expectedAdditionalSpend: number
}

/**
 * Extract budget increase metadata from recommendation
 */
function getBudgetIncreaseMetadata(metadata: Record<string, unknown> | null): BudgetIncreaseMetadata | null {
  if (!metadata || typeof metadata.currentDailyBudget !== 'number') return null
  return metadata as unknown as BudgetIncreaseMetadata
}

/**
 * Metadata structure for bid decrease recommendations
 */
interface BidDecreaseMetadata {
  campaignName: string
  currentAcos: number
  targetAcos: number
  suggestedBidReduction: number  // percentage
  expectedAcosImprovement: number
}

/**
 * Extract bid decrease metadata from recommendation
 */
function getBidDecreaseMetadata(metadata: Record<string, unknown> | null): BidDecreaseMetadata | null {
  if (!metadata || typeof metadata.suggestedBidReduction !== 'number') return null
  return metadata as unknown as BidDecreaseMetadata
}

interface RecommendationCardProps {
  recommendation: RecommendationWithRelations
  onAccept: (id: string, notes?: string) => Promise<void>
  onReject: (id: string, reason: string) => Promise<void>
  onSnooze: (id: string, days?: number) => Promise<void>
  isProcessing?: boolean
}

const typeConfig: Record<
  RecommendationType,
  { icon: React.ComponentType<{ className?: string }>; color: string; bgColor: string }
> = {
  KEYWORD_GRADUATION: {
    icon: TrendingUp,
    color: 'text-green-800',
    bgColor: 'bg-green-100',
  },
  NEGATIVE_KEYWORD: {
    icon: TrendingDown,
    color: 'text-red-800',
    bgColor: 'bg-red-100',
  },
  DUPLICATE_KEYWORD: {
    icon: AlertTriangle,
    color: 'text-yellow-800',
    bgColor: 'bg-yellow-100',
  },
  BUDGET_INCREASE: {
    icon: DollarSign,
    color: 'text-blue-800',
    bgColor: 'bg-blue-100',
  },
  BID_DECREASE: {
    icon: Target,
    color: 'text-purple-800',
    bgColor: 'bg-purple-100',
  },
}

const confidenceColors: Record<string, string> = {
  HIGH: 'bg-green-100 text-green-800 border-green-200',
  MEDIUM: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  LOW: 'bg-gray-100 text-gray-800 border-gray-200',
}

export function RecommendationCard({
  recommendation,
  onAccept,
  onReject,
  onSnooze,
  isProcessing = false,
}: RecommendationCardProps) {
  const [showAcceptModal, setShowAcceptModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showSnoozeModal, setShowSnoozeModal] = useState(false)
  const [isActioning, setIsActioning] = useState(false)

  const config = typeConfig[recommendation.type]
  const TypeIcon = config.icon
  const isPending = recommendation.status === 'PENDING'

  const improvement = calculateImprovementPercentage(recommendation.expectedImpact)

  // Extract campaign options for DUPLICATE_KEYWORD recommendations
  const campaignOptions = recommendation.type === 'DUPLICATE_KEYWORD'
    ? getCampaignOccurrences(recommendation.metadata).map(occ => ({
        id: occ.campaignId,
        name: occ.campaignName,
      }))
    : undefined

  const handleAccept = async (data: { notes?: string; selectedCampaignId?: string }) => {
    setIsActioning(true)
    try {
      // For DUPLICATE_KEYWORD, include the selected campaign in notes
      let acceptNotes = data.notes
      if (recommendation.type === 'DUPLICATE_KEYWORD' && data.selectedCampaignId) {
        const selectedCampaign = campaignOptions?.find(c => c.id === data.selectedCampaignId)
        acceptNotes = `Kept in campaign: ${selectedCampaign?.name || data.selectedCampaignId}${data.notes ? `. ${data.notes}` : ''}`
      }
      await onAccept(recommendation.id, acceptNotes)
    } finally {
      setIsActioning(false)
    }
  }

  const handleReject = async (data: { reason?: string }) => {
    if (!data.reason) return
    setIsActioning(true)
    try {
      await onReject(recommendation.id, data.reason)
    } finally {
      setIsActioning(false)
    }
  }

  const handleSnooze = async (data: { snoozeDays?: number }) => {
    setIsActioning(true)
    try {
      await onSnooze(recommendation.id, data.snoozeDays)
    } finally {
      setIsActioning(false)
    }
  }

  const displayName = recommendation.keyword || recommendation.campaign?.name || 'Unknown'

  return (
    <>
      <Card className={recommendation.status !== 'PENDING' ? 'opacity-60' : ''}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded ${config.bgColor}`}>
                <TypeIcon className={`h-4 w-4 ${config.color}`} />
              </div>
              <Badge className={`${config.bgColor} ${config.color} border-0`}>
                {getRecommendationTypeLabel(recommendation.type)}
              </Badge>
            </div>
            <Badge variant="outline" className={confidenceColors[recommendation.confidence]}>
              {getConfidenceLevelLabel(recommendation.confidence)}
            </Badge>
          </div>
          <CardTitle className="text-lg mt-2">{displayName}</CardTitle>
          {recommendation.campaign && recommendation.keyword && (
            <p className="text-sm text-muted-foreground">
              Campaign: {recommendation.campaign.name}
            </p>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Rationale */}
          <p className="text-sm text-muted-foreground">{recommendation.rationale}</p>

          {/* Expected Impact */}
          <div className="bg-muted p-3 rounded-md">
            <p className="text-sm font-medium mb-1">Expected Impact</p>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold">
                {improvement > 0 ? '+' : ''}
                {improvement.toFixed(1)}%
              </span>
              <span className="text-sm text-muted-foreground">
                {recommendation.expectedImpact.metric} improvement
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {recommendation.expectedImpact.current.toFixed(2)} &rarr;{' '}
              {recommendation.expectedImpact.projected.toFixed(2)}
            </p>
          </div>

          {/* Duplicate Keyword: Show all campaign occurrences */}
          {recommendation.type === 'DUPLICATE_KEYWORD' && (
            <div className="bg-muted/50 p-3 rounded-md">
              <p className="text-sm font-medium mb-2">
                Found in {getCampaignOccurrences(recommendation.metadata).length} campaigns:
              </p>
              <div className="space-y-2 text-sm">
                {getCampaignOccurrences(recommendation.metadata).map((occ) => (
                  <div key={occ.campaignId} className="flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="font-medium">{occ.campaignName}</span>
                      <span className="text-xs text-muted-foreground capitalize">{occ.matchType} match</span>
                    </div>
                    <span className="text-muted-foreground text-xs">
                      ${occ.spend.toFixed(2)} | {occ.orders} orders | {(occ.acos * 100).toFixed(1)}% ACOS
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Negative Keyword: Show spend, clicks, impressions, target campaigns */}
          {recommendation.type === 'NEGATIVE_KEYWORD' && (() => {
            const negMeta = getNegativeKeywordMetadata(recommendation.metadata)
            if (!negMeta) return null
            return (
              <div className="bg-muted/50 p-3 rounded-md">
                <p className="text-sm font-medium mb-2">Keyword Performance:</p>
                <div className="grid grid-cols-3 gap-2 text-sm mb-3">
                  <div>
                    <span className="text-muted-foreground">Spend:</span>
                    <span className="font-medium ml-1">${negMeta.totalSpend.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Clicks:</span>
                    <span className="font-medium ml-1">{negMeta.totalClicks}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Impressions:</span>
                    <span className="font-medium ml-1">{negMeta.totalImpressions.toLocaleString()}</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-1">
                  Add as negative in {negMeta.campaigns.length} campaign{negMeta.campaigns.length !== 1 ? 's' : ''}:
                </p>
                <ul className="text-sm list-disc list-inside text-muted-foreground">
                  {negMeta.campaigns.map((name, i) => (
                    <li key={negMeta.campaignIds[i]}>{name}</li>
                  ))}
                </ul>
              </div>
            )
          })()}

          {/* Budget Increase: Show current vs suggested budget with utilization */}
          {recommendation.type === 'BUDGET_INCREASE' && (() => {
            const budgetMeta = getBudgetIncreaseMetadata(recommendation.metadata)
            if (!budgetMeta) return null
            return (
              <div className="bg-muted/50 p-3 rounded-md">
                <p className="text-sm font-medium mb-2">Budget Recommendation:</p>
                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div>
                    <span className="text-muted-foreground">Current Budget:</span>
                    <span className="font-medium ml-1">${budgetMeta.currentDailyBudget.toFixed(2)}/day</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Suggested Budget:</span>
                    <span className="font-medium ml-1 text-green-600">${budgetMeta.suggestedDailyBudget.toFixed(2)}/day</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Budget Usage:</span>
                    <span className="font-medium ml-1">{(budgetMeta.budgetUtilization * 100).toFixed(0)}%</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Current ACOS:</span>
                    <span className="font-medium ml-1">{(budgetMeta.currentAcos * 100).toFixed(1)}%</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Expected additional daily spend: ${budgetMeta.expectedAdditionalSpend.toFixed(2)}
                </p>
              </div>
            )
          })()}

          {/* Bid Decrease: Show current vs target ACOS with reduction suggestion */}
          {recommendation.type === 'BID_DECREASE' && (() => {
            const bidMeta = getBidDecreaseMetadata(recommendation.metadata)
            if (!bidMeta) return null
            return (
              <div className="bg-muted/50 p-3 rounded-md">
                <p className="text-sm font-medium mb-2">Bid Adjustment:</p>
                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div>
                    <span className="text-muted-foreground">Current ACOS:</span>
                    <span className="font-medium ml-1 text-red-600">{(bidMeta.currentAcos * 100).toFixed(1)}%</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Target ACOS:</span>
                    <span className="font-medium ml-1">{(bidMeta.targetAcos * 100).toFixed(1)}%</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Suggested Reduction:</span>
                    <span className="font-medium ml-1 text-purple-600">{(bidMeta.suggestedBidReduction * 100).toFixed(0)}%</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Expected ACOS:</span>
                    <span className="font-medium ml-1 text-green-600">{(bidMeta.expectedAcosImprovement * 100).toFixed(1)}%</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Reduce bids across this campaign to improve ACOS towards target.
                </p>
              </div>
            )
          })()}

          {/* Status badge for non-pending */}
          {!isPending && (
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  recommendation.status === 'ACCEPTED'
                    ? 'default'
                    : recommendation.status === 'REJECTED'
                      ? 'destructive'
                      : 'secondary'
                }
              >
                {recommendation.status}
              </Badge>
              {recommendation.status === 'SNOOZED' && recommendation.snoozedUntil && (
                <span className="text-xs text-muted-foreground">
                  Until {new Date(recommendation.snoozedUntil).toLocaleDateString()}
                </span>
              )}
            </div>
          )}
        </CardContent>

        {isPending && (
          <CardFooter className="flex justify-end gap-2 pt-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSnoozeModal(true)}
              disabled={isProcessing || isActioning}
            >
              <PauseCircle className="h-4 w-4 mr-1" />
              Snooze
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRejectModal(true)}
              disabled={isProcessing || isActioning}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Reject
            </Button>
            <Button
              size="sm"
              onClick={() => setShowAcceptModal(true)}
              disabled={isProcessing || isActioning}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Accept
            </Button>
          </CardFooter>
        )}
      </Card>

      {/* Accept Modal */}
      <AcceptRejectModal
        open={showAcceptModal}
        onOpenChange={setShowAcceptModal}
        mode="accept"
        keyword={displayName}
        recommendationType={recommendation.type}
        campaignOptions={campaignOptions}
        onConfirm={handleAccept}
      />

      {/* Reject Modal */}
      <AcceptRejectModal
        open={showRejectModal}
        onOpenChange={setShowRejectModal}
        mode="reject"
        keyword={displayName}
        onConfirm={handleReject}
      />

      {/* Snooze Modal */}
      <AcceptRejectModal
        open={showSnoozeModal}
        onOpenChange={setShowSnoozeModal}
        mode="snooze"
        keyword={displayName}
        onConfirm={handleSnooze}
      />
    </>
  )
}
