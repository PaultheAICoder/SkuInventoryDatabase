'use client'

import { Button } from '@/components/ui/button'
import { MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FeedbackButtonProps {
  onClick: () => void
  className?: string
}

export function FeedbackButton({ onClick, className }: FeedbackButtonProps) {
  return (
    <Button
      variant="ghost"
      size={className?.includes('w-full') ? 'default' : 'icon'}
      onClick={onClick}
      title="Submit Feedback"
      aria-label="Submit Feedback"
      className={cn(className?.includes('w-full') && 'justify-start gap-2', className)}
    >
      <MessageSquare className="h-5 w-5" />
      {className?.includes('w-full') && <span>Submit Feedback</span>}
    </Button>
  )
}
