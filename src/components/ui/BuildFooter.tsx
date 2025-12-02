import { cn } from '@/lib/utils'
import versionData from '../../../version.json'

interface BuildFooterProps {
  className?: string
}

function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return 'Unknown'
  }
}

export function BuildFooter({ className }: BuildFooterProps) {
  return (
    <footer
      className={cn(
        'border-t bg-muted/50 px-4 py-2 text-center text-xs text-muted-foreground',
        className
      )}
    >
      <span>Build {versionData.version}</span>
      <span className="mx-2">|</span>
      <span>{formatTimestamp(versionData.buildTimestamp)}</span>
    </footer>
  )
}
