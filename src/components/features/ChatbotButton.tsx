'use client'

import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatbotButtonProps {
  onClick: () => void
  className?: string
}

export function ChatbotButton({ onClick, className }: ChatbotButtonProps) {
  const { data: session } = useSession()

  // Only show for admins
  if (session?.user?.role !== 'admin') {
    return null
  }

  return (
    <Button
      variant="ghost"
      size={className?.includes('w-full') ? 'default' : 'icon'}
      onClick={onClick}
      title="Ask the Assistant"
      aria-label="Ask the Assistant"
      className={cn(className?.includes('w-full') && 'justify-start gap-2', className)}
    >
      <MessageCircle className="h-5 w-5" />
      {className?.includes('w-full') && <span>Ask Assistant</span>}
    </Button>
  )
}
