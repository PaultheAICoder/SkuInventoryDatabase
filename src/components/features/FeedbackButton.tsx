'use client'

import { Button } from '@/components/ui/button'
import { MessageSquare } from 'lucide-react'

interface FeedbackButtonProps {
  onClick: () => void
}

export function FeedbackButton({ onClick }: FeedbackButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      title="Submit Feedback"
      aria-label="Submit Feedback"
    >
      <MessageSquare className="h-5 w-5" />
    </Button>
  )
}
