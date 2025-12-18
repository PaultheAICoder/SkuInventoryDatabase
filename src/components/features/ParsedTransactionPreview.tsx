'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  CheckCircle,
  AlertCircle,
  HelpCircle,
  Calendar,
  Package,
  Hash,
  Store,
  Edit2,
  Check,
  Truck,
  X,
} from 'lucide-react'
import type { ConfidenceLevel, ParseTransactionResponse } from '@/types/parser'
import { formatDateString, toLocalDateString } from '@/lib/utils'

interface ParsedTransactionPreviewProps {
  result: ParseTransactionResponse
  onConfirm: () => void
  onEdit: () => void
  onCancel: () => void
  onSaveAsDraft?: () => void
  isSubmitting?: boolean
}

function ConfidenceIcon({ level }: { level: ConfidenceLevel }) {
  switch (level) {
    case 'high':
      return <CheckCircle className="h-4 w-4 text-green-500" />
    case 'medium':
      return <AlertCircle className="h-4 w-4 text-yellow-500" />
    case 'low':
      return <HelpCircle className="h-4 w-4 text-red-500" />
  }
}

function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  const variants: Record<ConfidenceLevel, 'default' | 'secondary' | 'destructive'> = {
    high: 'default',
    medium: 'secondary',
    low: 'destructive',
  }
  return <Badge variant={variants[level]}>{level}</Badge>
}

export function ParsedTransactionPreview({
  result,
  onConfirm,
  onEdit,
  onCancel,
  onSaveAsDraft,
  isSubmitting = false,
}: ParsedTransactionPreviewProps) {
  const { parsed, suggestions } = result

  const formatDate = (date: Date | string) => {
    const dateStr = typeof date === 'string' ? date : toLocalDateString(date)
    return formatDateString(dateStr, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const transactionTypeLabels: Record<string, string> = {
    receipt: 'Receipt (Receive Components)',
    build: 'Build (Create SKU Units)',
    adjustment: 'Adjustment',
  }

  const transactionTypeIcons: Record<string, React.ReactNode> = {
    receipt: <Truck className="h-4 w-4" />,
    build: <Package className="h-4 w-4" />,
    adjustment: <Edit2 className="h-4 w-4" />,
  }

  const hasLowConfidence =
    parsed.overallConfidence === 'low' ||
    !parsed.itemId.value ||
    parsed.itemId.confidence === 'low'

  const hasSuggestions = suggestions.length > 0

  return (
    <Card className={hasLowConfidence ? 'border-yellow-500' : ''}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Parsed Transaction</span>
          <ConfidenceBadge level={parsed.overallConfidence} />
        </CardTitle>
        {hasLowConfidence && (
          <div className="rounded-md bg-yellow-50 border border-yellow-200 p-2 text-sm text-yellow-800 dark:bg-yellow-950 dark:border-yellow-900 dark:text-yellow-200">
            Some fields have low confidence. Please review carefully or switch to manual entry.
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Transaction Type */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {transactionTypeIcons[parsed.transactionType.value]}
            <span className="text-sm font-medium">Type</span>
          </div>
          <div className="flex items-center gap-2">
            <span>{transactionTypeLabels[parsed.transactionType.value]}</span>
            <ConfidenceIcon level={parsed.transactionType.confidence} />
          </div>
        </div>

        {/* Item */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {parsed.itemType.value === 'sku' ? 'SKU' : 'Component'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span>{parsed.itemName.value}</span>
            {parsed.itemId.value ? (
              <ConfidenceIcon level={parsed.itemId.confidence} />
            ) : (
              <Badge variant="destructive">Not Found</Badge>
            )}
          </div>
        </div>

        {/* Quantity */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Quantity</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono">{parsed.quantity.value.toLocaleString()}</span>
            <ConfidenceIcon level={parsed.quantity.confidence} />
          </div>
        </div>

        {/* Sales Channel (for builds) */}
        {parsed.salesChannel && parsed.salesChannel.value && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Sales Channel</span>
            </div>
            <div className="flex items-center gap-2">
              <span>{parsed.salesChannel.value}</span>
              <ConfidenceIcon level={parsed.salesChannel.confidence} />
            </div>
          </div>
        )}

        {/* Date */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Date</span>
          </div>
          <div className="flex items-center gap-2">
            <span>{formatDate(parsed.date.value)}</span>
            <ConfidenceIcon level={parsed.date.confidence} />
          </div>
        </div>

        {/* Supplier (for receipts) */}
        {parsed.supplier && parsed.supplier.value && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Supplier</span>
            </div>
            <div className="flex items-center gap-2">
              <span>{parsed.supplier.value}</span>
              <ConfidenceIcon level={parsed.supplier.confidence} />
            </div>
          </div>
        )}

        {/* Notes */}
        {parsed.notes && parsed.notes.value && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Notes</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{parsed.notes.value}</span>
            </div>
          </div>
        )}

        {/* Suggestions */}
        {hasSuggestions && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-2">Suggestions:</p>
            {suggestions.map((suggestion, i) => (
              <div key={i} className="text-sm">
                <span className="font-medium">{suggestion.field}:</span>{' '}
                {suggestion.alternatives.slice(0, 3).map((alt) => alt.label).join(', ')}
              </div>
            ))}
          </div>
        )}

        {/* Original Input */}
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">Original input:</p>
          <p className="text-sm italic">&quot;{parsed.originalInput}&quot;</p>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          <X className="mr-2 h-4 w-4" />
          Cancel
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onEdit} disabled={isSubmitting}>
            <Edit2 className="mr-2 h-4 w-4" />
            Edit Manually
          </Button>
          {onSaveAsDraft && (
            <Button
              variant="secondary"
              onClick={onSaveAsDraft}
              disabled={isSubmitting || !parsed.itemId.value}
            >
              Save as Draft
            </Button>
          )}
          <Button
            onClick={onConfirm}
            disabled={isSubmitting || !parsed.itemId.value}
          >
            <Check className="mr-2 h-4 w-4" />
            {isSubmitting ? 'Submitting...' : 'Confirm & Submit'}
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
