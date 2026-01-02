'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { History } from 'lucide-react'
import type { ChangeLogEntryWithRelations, RecommendationType } from '@/types/recommendations'

interface ChangeLogTableProps {
  entries: ChangeLogEntryWithRelations[]
  isLoading: boolean
}

const TYPE_LABELS: Record<RecommendationType, string> = {
  KEYWORD_GRADUATION: 'Keyword Graduation',
  NEGATIVE_KEYWORD: 'Negative Keyword',
  DUPLICATE_KEYWORD: 'Duplicate Keyword',
  BUDGET_INCREASE: 'Budget Increase',
  BID_DECREASE: 'Bid Decrease',
}

const getActionBadgeVariant = (action: string) => {
  switch (action) {
    case 'ACCEPTED':
      return 'success'
    case 'REJECTED':
      return 'critical'
    case 'SNOOZED':
      return 'default'
    default:
      return 'secondary'
  }
}

const getTypeBadgeVariant = (type: RecommendationType) => {
  switch (type) {
    case 'KEYWORD_GRADUATION':
      return 'outline'
    case 'NEGATIVE_KEYWORD':
      return 'warning'
    case 'DUPLICATE_KEYWORD':
      return 'secondary'
    case 'BUDGET_INCREASE':
      return 'success'
    case 'BID_DECREASE':
      return 'default'
    default:
      return 'secondary'
  }
}

const formatBeforeAfter = (beforeValues: Record<string, unknown>, afterValues: Record<string, unknown> | null): string => {
  if (!afterValues) {
    // For rejected/snoozed, just show before state
    const keys = Object.keys(beforeValues).slice(0, 2)
    if (keys.length === 0) return '-'
    return keys.map(k => `${k}: ${beforeValues[k]}`).join(', ')
  }

  // Show key changes
  const changes: string[] = []
  for (const key of Object.keys(beforeValues)) {
    if (afterValues[key] !== undefined && beforeValues[key] !== afterValues[key]) {
      changes.push(`${key}: ${beforeValues[key]} -> ${afterValues[key]}`)
    }
  }

  if (changes.length === 0) {
    const keys = Object.keys(beforeValues).slice(0, 2)
    return keys.map(k => `${k}: ${beforeValues[k]}`).join(', ')
  }

  return changes.slice(0, 2).join(', ') + (changes.length > 2 ? '...' : '')
}

const truncateText = (text: string | null, maxLength: number = 50): string => {
  if (!text) return '-'
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

export function ChangeLogTable({ entries, isLoading }: ChangeLogTableProps) {
  if (isLoading) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date/Time</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Keyword</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead>Actioned By</TableHead>
              <TableHead>Changes</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRow key={i}>
                <TableCell><div className="h-4 w-32 animate-pulse rounded bg-muted" /></TableCell>
                <TableCell><div className="h-4 w-20 animate-pulse rounded bg-muted" /></TableCell>
                <TableCell><div className="h-4 w-28 animate-pulse rounded bg-muted" /></TableCell>
                <TableCell><div className="h-4 w-24 animate-pulse rounded bg-muted" /></TableCell>
                <TableCell><div className="h-4 w-28 animate-pulse rounded bg-muted" /></TableCell>
                <TableCell><div className="h-4 w-20 animate-pulse rounded bg-muted" /></TableCell>
                <TableCell><div className="h-4 w-40 animate-pulse rounded bg-muted" /></TableCell>
                <TableCell><div className="h-4 w-32 animate-pulse rounded bg-muted" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date/Time</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Keyword</TableHead>
            <TableHead>Campaign</TableHead>
            <TableHead>Actioned By</TableHead>
            <TableHead>Changes</TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="p-0">
                <EmptyState
                  icon={History}
                  title="No change log entries found"
                  description="Action recommendations to see them appear in the change log."
                />
              </TableCell>
            </TableRow>
          ) : (
            entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="font-mono text-sm whitespace-nowrap" suppressHydrationWarning>
                  {new Date(entry.createdAt).toLocaleDateString()}{' '}
                  {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </TableCell>
                <TableCell>
                  <Badge variant={getActionBadgeVariant(entry.action)}>
                    {entry.action}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={getTypeBadgeVariant(entry.recommendation.type)}>
                    {TYPE_LABELS[entry.recommendation.type] || entry.recommendation.type}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[150px] truncate" title={entry.recommendation.keyword || ''}>
                  {entry.recommendation.keyword || '-'}
                </TableCell>
                <TableCell className="max-w-[150px] truncate" title={entry.recommendation.campaign?.name || ''}>
                  {entry.recommendation.campaign?.name || '-'}
                </TableCell>
                <TableCell>{entry.user.name}</TableCell>
                <TableCell className="max-w-[200px] text-xs text-muted-foreground" title={formatBeforeAfter(entry.beforeValues, entry.afterValues)}>
                  {formatBeforeAfter(entry.beforeValues, entry.afterValues)}
                </TableCell>
                <TableCell className="max-w-[150px]" title={entry.notes || entry.reason || ''}>
                  {truncateText(entry.notes || entry.reason)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
