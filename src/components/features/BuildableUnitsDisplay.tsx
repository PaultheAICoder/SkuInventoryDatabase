import { Package } from 'lucide-react'

interface BuildableUnitsDisplayProps {
  maxBuildableUnits: number | null | undefined
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function BuildableUnitsDisplay({
  maxBuildableUnits,
  showLabel = true,
  size = 'md',
}: BuildableUnitsDisplayProps) {
  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-2xl',
  }

  if (maxBuildableUnits == null) {
    return (
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">No BOM</span>
      </div>
    )
  }

  const isZero = maxBuildableUnits === 0
  const isLow = maxBuildableUnits > 0 && maxBuildableUnits < 10

  return (
    <div className="flex items-center gap-2">
      <Package className={`h-4 w-4 ${isZero ? 'text-red-500' : isLow ? 'text-yellow-500' : 'text-green-500'}`} />
      <div>
        <span
          className={`font-mono font-medium ${sizeClasses[size]} ${
            isZero ? 'text-red-600' : isLow ? 'text-yellow-600' : ''
          }`}
          suppressHydrationWarning
        >
          {maxBuildableUnits.toLocaleString()}
        </span>
        {showLabel && (
          <span className="text-muted-foreground text-sm ml-1">
            {maxBuildableUnits === 1 ? 'unit' : 'units'}
          </span>
        )}
      </div>
    </div>
  )
}
