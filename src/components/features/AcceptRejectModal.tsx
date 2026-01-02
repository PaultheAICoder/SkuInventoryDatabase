'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type ModalMode = 'accept' | 'reject' | 'snooze'

interface CampaignOption {
  id: string
  name: string
}

interface AcceptRejectModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: ModalMode
  keyword?: string
  recommendationType?: string
  campaignOptions?: CampaignOption[]
  onConfirm: (data: { notes?: string; reason?: string; snoozeDays?: number; selectedCampaignId?: string }) => Promise<void>
}

const snoozeOptions = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '21', label: '21 days' },
  { value: '30', label: '30 days' },
]

const modeConfig = {
  accept: {
    title: 'Accept Recommendation',
    description: 'This will mark the recommendation as accepted.',
    confirmLabel: 'Accept',
    confirmVariant: 'default' as const,
  },
  reject: {
    title: 'Reject Recommendation',
    description: 'Please provide a reason for rejecting this recommendation.',
    confirmLabel: 'Reject',
    confirmVariant: 'destructive' as const,
  },
  snooze: {
    title: 'Snooze Recommendation',
    description: 'This recommendation will reappear after the snooze period.',
    confirmLabel: 'Snooze',
    confirmVariant: 'secondary' as const,
  },
}

export function AcceptRejectModal({
  open,
  onOpenChange,
  mode,
  keyword,
  recommendationType,
  campaignOptions,
  onConfirm,
}: AcceptRejectModalProps) {
  const [notes, setNotes] = useState('')
  const [reason, setReason] = useState('')
  const [snoozeDays, setSnoozeDays] = useState('7')
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const config = modeConfig[mode]
  const isDuplicateKeyword = recommendationType === 'DUPLICATE_KEYWORD'
  const hasCampaignOptions = campaignOptions && campaignOptions.length > 0

  const resetState = () => {
    setNotes('')
    setReason('')
    setSnoozeDays('7')
    setSelectedCampaignId('')
    setError(null)
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetState()
    }
    onOpenChange(newOpen)
  }

  const handleConfirm = async () => {
    // Validate rejection requires reason
    if (mode === 'reject' && !reason.trim()) {
      setError('Please provide a reason for rejection')
      return
    }

    // Validate duplicate keyword requires campaign selection
    if (mode === 'accept' && isDuplicateKeyword && hasCampaignOptions && !selectedCampaignId) {
      setError('Please select which campaign to keep the keyword in')
      return
    }

    setError(null)
    setIsLoading(true)

    try {
      await onConfirm({
        notes: mode === 'accept' ? notes.trim() || undefined : undefined,
        reason: mode === 'reject' ? reason.trim() : undefined,
        snoozeDays: mode === 'snooze' ? parseInt(snoozeDays, 10) : undefined,
        selectedCampaignId: mode === 'accept' && isDuplicateKeyword ? selectedCampaignId || undefined : undefined,
      })
      handleOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription>
            {keyword && (
              <span className="font-medium text-foreground">&quot;{keyword}&quot;</span>
            )}
            <br />
            {config.description}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {mode === 'accept' && isDuplicateKeyword && hasCampaignOptions && (
            <div className="space-y-2">
              <Label htmlFor="campaign">
                Keep keyword in campaign <span className="text-destructive">*</span>
              </Label>
              <Select
                value={selectedCampaignId}
                onValueChange={(value) => {
                  setSelectedCampaignId(value)
                  if (error) setError(null)
                }}
              >
                <SelectTrigger id="campaign" className={error ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Select campaign to keep" />
                </SelectTrigger>
                <SelectContent>
                  {campaignOptions.map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The keyword will be removed from other campaigns.
              </p>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}

          {mode === 'accept' && (
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                placeholder="Add any notes about this acceptance..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
          )}

          {mode === 'reject' && (
            <div className="space-y-2">
              <Label htmlFor="reason">
                Reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="reason"
                placeholder="Enter a reason for rejection..."
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value)
                  if (error) setError(null)
                }}
                className={`min-h-[80px] ${error ? 'border-destructive' : ''}`}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          )}

          {mode === 'snooze' && (
            <div className="space-y-2">
              <Label htmlFor="snoozeDays">Snooze duration</Label>
              <Select value={snoozeDays} onValueChange={setSnoozeDays}>
                <SelectTrigger id="snoozeDays">
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent>
                  {snoozeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            variant={config.confirmVariant}
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : config.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
