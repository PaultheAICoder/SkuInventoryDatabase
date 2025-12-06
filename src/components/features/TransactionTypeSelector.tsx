'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PackagePlus, PackageMinus, Scale } from 'lucide-react'

export type TransactionTypeValue = 'inbound' | 'outbound' | 'adjustment'

interface TransactionTypeSelectorProps {
  value: TransactionTypeValue
  onValueChange: (value: TransactionTypeValue) => void
  disabled?: boolean
}

const TRANSACTION_TYPES = [
  { value: 'inbound' as const, label: 'Inbound', icon: PackagePlus, description: 'Receive components' },
  { value: 'outbound' as const, label: 'Outbound', icon: PackageMinus, description: 'Ship SKUs' },
  { value: 'adjustment' as const, label: 'Adjustment', icon: Scale, description: 'Adjust inventory' },
]

export function TransactionTypeSelector({
  value,
  onValueChange,
  disabled = false,
}: TransactionTypeSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup">
      {TRANSACTION_TYPES.map((type) => (
        <Button
          key={type.value}
          type="button"
          variant={value === type.value ? 'default' : 'outline'}
          className={cn(
            'h-auto flex-col gap-1 py-3',
            value === type.value && 'ring-2 ring-ring ring-offset-2'
          )}
          onClick={() => onValueChange(type.value)}
          disabled={disabled}
          role="radio"
          aria-checked={value === type.value}
        >
          <type.icon className="h-5 w-5" />
          <span className="font-medium">{type.label}</span>
          <span className="text-xs text-muted-foreground">{type.description}</span>
        </Button>
      ))}
    </div>
  )
}
