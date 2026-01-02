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

  const handleAccept = async (data: { notes?: string }) => {
    setIsActioning(true)
    try {
      await onAccept(recommendation.id, data.notes)
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
