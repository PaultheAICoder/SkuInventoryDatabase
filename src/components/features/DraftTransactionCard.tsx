'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  CheckCircle,
  XCircle,
  Clock,
  User,
  Calendar,
  Package,
  Truck,
  ArrowLeftRight,
  Hash,
  MapPin,
} from 'lucide-react'
import type { DraftTransactionResponse } from '@/types/draft'
import { DRAFT_STATUS_CONFIG } from '@/types/draft'
import { formatDateString } from '@/lib/utils'

interface DraftTransactionCardProps {
  draft: DraftTransactionResponse
  onApprove: (id: string) => Promise<void>
  onReject: (id: string, reason?: string) => Promise<void>
  isProcessing?: boolean
}

const transactionTypeConfig = {
  receipt: { label: 'Receipt', icon: Truck, color: 'bg-green-100 text-green-800' },
  build: { label: 'Build', icon: Package, color: 'bg-blue-100 text-blue-800' },
  adjustment: { label: 'Adjustment', icon: Hash, color: 'bg-yellow-100 text-yellow-800' },
  initial: { label: 'Initial', icon: Package, color: 'bg-purple-100 text-purple-800' },
  transfer: { label: 'Transfer', icon: ArrowLeftRight, color: 'bg-orange-100 text-orange-800' },
}

export function DraftTransactionCard({
  draft,
  onApprove,
  onReject,
  isProcessing = false,
}: DraftTransactionCardProps) {
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [isApproving, setIsApproving] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)

  const typeConfig = transactionTypeConfig[draft.type]
  const statusConfig = DRAFT_STATUS_CONFIG[draft.status]
  const TypeIcon = typeConfig.icon

  const handleApprove = async () => {
    setIsApproving(true)
    try {
      await onApprove(draft.id)
    } finally {
      setIsApproving(false)
    }
  }

  const handleReject = async () => {
    setIsRejecting(true)
    try {
      await onReject(draft.id, rejectReason || undefined)
      setShowRejectDialog(false)
      setRejectReason('')
    } finally {
      setIsRejecting(false)
    }
  }

  // Calculate total quantity from lines
  const totalQuantity = draft.lines.reduce((sum, line) => {
    return sum + Math.abs(parseFloat(line.quantityChange))
  }, 0)

  // Get primary item name
  const primaryItemName = draft.type === 'build'
    ? draft.sku?.name
    : draft.lines[0]?.component?.name

  const formatDate = (dateStr: string) => {
    return formatDateString(dateStr, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <>
      <Card className={draft.status === 'rejected' ? 'opacity-60' : ''}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded ${typeConfig.color}`}>
                <TypeIcon className="h-4 w-4" />
              </div>
              <CardTitle className="text-base">{typeConfig.label}</CardTitle>
            </div>
            <Badge
              variant={
                statusConfig.variant === 'warning'
                  ? 'secondary'
                  : statusConfig.variant === 'success'
                    ? 'default'
                    : 'destructive'
              }
            >
              {statusConfig.label}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Primary Info */}
          <div className="space-y-2">
            {primaryItemName && (
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{primaryItemName}</span>
              </div>
            )}

            {(draft.type === 'build' && draft.unitsBuild) ? (
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <span>{draft.unitsBuild.toLocaleString()} units</span>
              </div>
            ) : totalQuantity > 0 ? (
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <span>{totalQuantity.toLocaleString()} qty</span>
              </div>
            ) : null}

            {draft.location && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{draft.location.name}</span>
              </div>
            )}

            {draft.type === 'transfer' && draft.fromLocation && draft.toLocation && (
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {draft.fromLocation.name} to {draft.toLocation.name}
                </span>
              </div>
            )}
          </div>

          {/* Meta Info */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground pt-2 border-t">
            <div className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              <span>{formatDate(draft.date)}</span>
            </div>
            <div className="flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              <span>{draft.createdBy.name}</span>
            </div>
          </div>

          {/* Notes */}
          {draft.notes && (
            <p className="text-sm text-muted-foreground italic">
              &quot;{draft.notes}&quot;
            </p>
          )}

          {/* Rejection Reason */}
          {draft.status === 'rejected' && draft.rejectReason && (
            <div className="bg-destructive/10 rounded p-2 text-sm">
              <span className="font-medium">Rejected: </span>
              {draft.rejectReason}
            </div>
          )}

          {/* Reviewer Info */}
          {draft.reviewedBy && draft.reviewedAt && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>
                {draft.status === 'approved' ? 'Approved' : 'Rejected'} by {draft.reviewedBy.name} on{' '}
                {formatDate(draft.reviewedAt)}
              </span>
            </div>
          )}
        </CardContent>

        {draft.status === 'draft' && (
          <CardFooter className="flex justify-end gap-2 pt-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRejectDialog(true)}
              disabled={isProcessing || isApproving}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Reject
            </Button>
            <Button
              size="sm"
              onClick={handleApprove}
              disabled={isProcessing || isApproving}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              {isApproving ? 'Approving...' : 'Approve'}
            </Button>
          </CardFooter>
        )}
      </Card>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Draft Transaction</DialogTitle>
            <DialogDescription>
              Are you sure you want to reject this {draft.type} transaction?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="reject-reason">Reason (optional)</Label>
            <Input
              id="reject-reason"
              placeholder="Enter a reason for rejection..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRejectDialog(false)}
              disabled={isRejecting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={isRejecting}
            >
              {isRejecting ? 'Rejecting...' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
