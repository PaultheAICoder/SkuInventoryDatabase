import { Package } from 'lucide-react'
import { LimitingComponentsPopover } from './LimitingComponentsPopover'

interface BuildableUnitsDisplayProps {
  maxBuildableUnits: number | null | undefined
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg'
  skuId?: string // Required for clickable version
  locationId?: string // For location-filtered queries
  clickable?: boolean // Enable click-to-show limiting factors
}

export function BuildableUnitsDisplay({
  maxBuildableUnits,
  showLabel = true,
  size = 'md',
  skuId,
  locationId,
  clickable = false,
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

  const content = (
    <div className={`flex items-center gap-2 ${clickable && skuId ? 'cursor-pointer hover:opacity-80' : ''}`}>
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

  // Wrap in popover if clickable and skuId provided
  if (clickable && skuId) {
    return (
      <LimitingComponentsPopover
        skuId={skuId}
        maxBuildableUnits={maxBuildableUnits}
        locationId={locationId}
      >
        {content}
      </LimitingComponentsPopover>
    )
  }

  return content
}
