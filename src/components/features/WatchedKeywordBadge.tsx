'use client'

import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface WatchedKeywordBadgeProps {
  isWatched: boolean
  onToggle: () => void
  disabled?: boolean
  size?: 'sm' | 'md'
}

/**
 * WatchedKeywordBadge Component
 *
 * A star icon button that toggles the watched state of a keyword.
 * - Filled star (solid yellow): keyword is being watched
 * - Outline star: keyword is not watched
 *
 * Uses title attribute for accessibility tooltip information.
 */
export function WatchedKeywordBadge({
  isWatched,
  onToggle,
  disabled = false,
  size = 'sm',
}: WatchedKeywordBadgeProps) {
  const iconSize = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'
  const buttonSize = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9'

  return (
    <Button
      variant="ghost"
      size="icon"
      className={buttonSize}
      onClick={(e) => {
        e.stopPropagation() // Prevent row click if in a table
        onToggle()
      }}
      disabled={disabled}
      title={isWatched ? 'Unwatch keyword' : 'Watch keyword'}
      aria-label={isWatched ? 'Unwatch keyword' : 'Watch keyword'}
    >
      <Star
        className={`${iconSize} ${
          isWatched
            ? 'fill-yellow-500 text-yellow-500'
            : 'text-muted-foreground hover:text-yellow-500'
        }`}
      />
    </Button>
  )
}
