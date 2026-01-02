'use client'

import { RecommendationCard } from './RecommendationCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Lightbulb } from 'lucide-react'
import type { RecommendationWithRelations } from '@/types/recommendations'

interface RecommendationListProps {
  recommendations: RecommendationWithRelations[]
  onAction: (
    id: string,
    action: 'accept' | 'reject' | 'snooze',
    data?: { notes?: string; reason?: string; snoozeDays?: number }
  ) => Promise<void>
  isLoading: boolean
  isProcessing?: boolean
}

function LoadingSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="border rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-6 w-24" />
          </div>
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-20 w-full" />
          <div className="flex justify-end gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Lightbulb className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-1">No recommendations</h3>
      <p className="text-muted-foreground max-w-sm">
        There are no recommendations matching your current filters. Try generating new
        recommendations or adjusting your filters.
      </p>
    </div>
  )
}

export function RecommendationList({
  recommendations,
  onAction,
  isLoading,
  isProcessing = false,
}: RecommendationListProps) {
  if (isLoading) {
    return <LoadingSkeleton />
  }

  if (recommendations.length === 0) {
    return <EmptyState />
  }

  const handleAccept = async (id: string, notes?: string) => {
    await onAction(id, 'accept', { notes })
  }

  const handleReject = async (id: string, reason: string) => {
    await onAction(id, 'reject', { reason })
  }

  const handleSnooze = async (id: string, days?: number) => {
    await onAction(id, 'snooze', { snoozeDays: days })
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {recommendations.map((recommendation) => (
        <RecommendationCard
          key={recommendation.id}
          recommendation={recommendation}
          onAccept={handleAccept}
          onReject={handleReject}
          onSnooze={handleSnooze}
          isProcessing={isProcessing}
        />
      ))}
    </div>
  )
}
