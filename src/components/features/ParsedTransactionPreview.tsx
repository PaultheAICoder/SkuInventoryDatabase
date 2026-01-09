'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  CheckCircle,
  AlertCircle,
  HelpCircle,
  Calendar,
  Package,
  Hash,
  Store,
  Edit2,
  Check,
  Truck,
  X,
  MapPin,
  FileQuestion,
} from 'lucide-react'
import type { ConfidenceLevel, ParseTransactionResponse } from '@/types/parser'
import { formatDateString, toLocalDateString } from '@/lib/utils'
import { EditablePreviewField, EditableFieldOption } from './EditablePreviewField'

// Adjustment reasons matching QuickEntryForm
const ADJUSTMENT_REASONS: EditableFieldOption[] = [
  { value: 'Inventory count correction', label: 'Inventory count correction' },
  { value: 'Damaged goods', label: 'Damaged goods' },
  { value: 'Lost/missing', label: 'Lost/missing' },
  { value: 'Sample/testing', label: 'Sample/testing' },
  { value: 'Returned to supplier', label: 'Returned to supplier' },
  { value: 'Other', label: 'Other (specify in notes)' },
]

export interface FieldOverrides {
  supplier?: string
  locationId?: string
  reason?: string
}

interface ParsedTransactionPreviewProps {
  result: ParseTransactionResponse
  onConfirm: (overrides?: FieldOverrides) => void
  onEdit: () => void
  onCancel: () => void
  onSaveAsDraft?: (overrides?: FieldOverrides) => void
  isSubmitting?: boolean
}

interface LocationOption {
  id: string
  name: string
}

interface SupplierOption {
  value: string
}

function ConfidenceIcon({ level }: { level: ConfidenceLevel }) {
  switch (level) {
    case 'high':
      return <CheckCircle className="h-4 w-4 text-green-500" />
    case 'medium':
      return <AlertCircle className="h-4 w-4 text-yellow-500" />
    case 'low':
      return <HelpCircle className="h-4 w-4 text-red-500" />
  }
}

function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  const variants: Record<ConfidenceLevel, 'default' | 'secondary' | 'destructive'> = {
    high: 'default',
    medium: 'secondary',
    low: 'destructive',
  }
  return <Badge variant={variants[level]}>{level}</Badge>
}

export function ParsedTransactionPreview({
  result,
  onConfirm,
  onEdit,
  onCancel,
  onSaveAsDraft,
  isSubmitting = false,
}: ParsedTransactionPreviewProps) {
  const { parsed, suggestions } = result

  // Local state for editable field values
  const [supplierValue, setSupplierValue] = useState<string>(parsed.supplier?.value || '')
  const [locationId, setLocationId] = useState<string>('')
  const [locationName, setLocationName] = useState<string>(parsed.location?.value || '')
  const [reasonValue, setReasonValue] = useState<string>(parsed.reason?.value || '')

  // Data loading state
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [isLoadingLocations, setIsLoadingLocations] = useState(true)
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(false)

  // Debounce ref for supplier search
  const supplierDebounceRef = useRef<NodeJS.Timeout | null>(null)

  // Fetch locations on mount
  useEffect(() => {
    const fetchLocations = async () => {
      setIsLoadingLocations(true)
      try {
        const res = await fetch('/api/locations?isActive=true&pageSize=50')
        if (res.ok) {
          const data = await res.json()
          setLocations(data.data || [])

          // If parsed location name exists, try to find matching location ID
          if (parsed.location?.value) {
            const matchingLocation = (data.data || []).find(
              (loc: LocationOption) => loc.name.toLowerCase() === parsed.location?.value?.toLowerCase()
            )
            if (matchingLocation) {
              setLocationId(matchingLocation.id)
              setLocationName(matchingLocation.name)
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch locations:', err)
      } finally {
        setIsLoadingLocations(false)
      }
    }
    fetchLocations()
  }, [parsed.location?.value])

  // Fetch suppliers on mount (only for receipt transactions)
  useEffect(() => {
    if (parsed.transactionType.value !== 'receipt') return

    const fetchSuppliers = async () => {
      setIsLoadingSuppliers(true)
      try {
        const res = await fetch('/api/suppliers')
        if (res.ok) {
          const data = await res.json()
          setSuppliers(data.data || [])
        }
      } catch (err) {
        console.error('Failed to fetch suppliers:', err)
      } finally {
        setIsLoadingSuppliers(false)
      }
    }
    fetchSuppliers()
  }, [parsed.transactionType.value])

  // Handle supplier search with debounce
  const handleSupplierSearch = useCallback((query: string) => {
    if (supplierDebounceRef.current) {
      clearTimeout(supplierDebounceRef.current)
    }
    supplierDebounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams()
        if (query) {
          params.set('search', query)
        }
        const res = await fetch(`/api/suppliers?${params}`)
        if (res.ok) {
          const data = await res.json()
          setSuppliers(data.data || [])
        }
      } catch (err) {
        console.error('Failed to search suppliers:', err)
      }
    }, 300)
  }, [])

  // Handle location change - update both ID and name
  const handleLocationChange = useCallback((selectedId: string) => {
    setLocationId(selectedId)
    const selectedLocation = locations.find((loc) => loc.id === selectedId)
    if (selectedLocation) {
      setLocationName(selectedLocation.name)
    }
  }, [locations])

  const formatDate = (date: Date | string) => {
    const dateStr = typeof date === 'string' ? date : toLocalDateString(date)
    return formatDateString(dateStr, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const transactionTypeLabels: Record<string, string> = {
    receipt: 'Receipt (Receive Components)',
    build: 'Build (Create SKU Units)',
    adjustment: 'Adjustment',
  }

  const transactionTypeIcons: Record<string, React.ReactNode> = {
    receipt: <Truck className="h-4 w-4" />,
    build: <Package className="h-4 w-4" />,
    adjustment: <Edit2 className="h-4 w-4" />,
  }

  const hasLowConfidence =
    parsed.overallConfidence === 'low' ||
    !parsed.itemId.value ||
    parsed.itemId.confidence === 'low'

  // Check for missing required fields with override values
  const isSupplierMissing = parsed.transactionType.value === 'receipt' && !supplierValue
  const isReasonMissing = parsed.transactionType.value === 'adjustment' && !reasonValue

  const missingRequiredFields = isSupplierMissing || isReasonMissing

  const hasSuggestions = suggestions.length > 0

  // Build overrides object for submission
  const getOverrides = (): FieldOverrides | undefined => {
    const overrides: FieldOverrides = {}

    if (supplierValue && supplierValue !== parsed.supplier?.value) {
      overrides.supplier = supplierValue
    }
    if (locationId) {
      overrides.locationId = locationId
    }
    if (reasonValue && reasonValue !== parsed.reason?.value) {
      overrides.reason = reasonValue
    }

    return Object.keys(overrides).length > 0 ? overrides : undefined
  }

  // Handle confirm with overrides
  const handleConfirm = () => {
    onConfirm(getOverrides())
  }

  // Handle save as draft with overrides
  const handleSaveAsDraft = () => {
    if (onSaveAsDraft) {
      onSaveAsDraft(getOverrides())
    }
  }

  // Prepare options for dropdowns
  const locationOptions: EditableFieldOption[] = locations.map((loc) => ({
    value: loc.id,
    label: loc.name,
  }))

  const supplierOptions: EditableFieldOption[] = suppliers.map((s) => ({
    value: s.value,
    label: s.value,
  }))

  // Determine if confirm should be disabled
  const isConfirmDisabled = isSubmitting || !parsed.itemId.value || missingRequiredFields

  return (
    <Card className={hasLowConfidence ? 'border-yellow-500' : ''}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Parsed Transaction</span>
          <ConfidenceBadge level={parsed.overallConfidence} />
        </CardTitle>
        {hasLowConfidence && (
          <div className="rounded-md bg-yellow-50 border border-yellow-200 p-2 text-sm text-yellow-800 dark:bg-yellow-950 dark:border-yellow-900 dark:text-yellow-200">
            Some fields have low confidence. Please review carefully or switch to manual entry.
          </div>
        )}
        {missingRequiredFields && !hasLowConfidence && (
          <div className="rounded-md bg-orange-50 border border-orange-200 p-2 text-sm text-orange-800 dark:bg-orange-950 dark:border-orange-900 dark:text-orange-200">
            Please fill in the required fields below before confirming.
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Transaction Type */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {transactionTypeIcons[parsed.transactionType.value]}
            <span className="text-sm font-medium">Type</span>
          </div>
          <div className="flex items-center gap-2">
            <span>{transactionTypeLabels[parsed.transactionType.value]}</span>
            <ConfidenceIcon level={parsed.transactionType.confidence} />
          </div>
        </div>

        {/* Item */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {parsed.itemType.value === 'sku' ? 'SKU' : 'Component'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span>{parsed.itemName.value}</span>
            {parsed.itemId.value ? (
              <ConfidenceIcon level={parsed.itemId.confidence} />
            ) : (
              <Badge variant="destructive">Not Found</Badge>
            )}
          </div>
        </div>

        {/* Quantity */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Quantity</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono">{parsed.quantity.value.toLocaleString()}</span>
            <ConfidenceIcon level={parsed.quantity.confidence} />
          </div>
        </div>

        {/* Sales Channel (for builds) */}
        {parsed.salesChannel && parsed.salesChannel.value && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Sales Channel</span>
            </div>
            <div className="flex items-center gap-2">
              <span>{parsed.salesChannel.value}</span>
              <ConfidenceIcon level={parsed.salesChannel.confidence} />
            </div>
          </div>
        )}

        {/* Date */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Date</span>
          </div>
          <div className="flex items-center gap-2">
            <span>{formatDate(parsed.date.value)}</span>
            <ConfidenceIcon level={parsed.date.confidence} />
          </div>
        </div>

        {/* Supplier (for receipts) - Now editable */}
        {parsed.transactionType.value === 'receipt' && (
          <EditablePreviewField
            label="Supplier"
            icon={<Truck className="h-4 w-4" />}
            value={supplierValue}
            onChange={setSupplierValue}
            options={supplierOptions}
            isLoading={isLoadingSuppliers}
            onSearch={handleSupplierSearch}
            placeholder="Select or enter supplier"
            required={true}
            allowFreeText={true}
          />
        )}

        {/* Reason (for adjustments) - Now editable */}
        {parsed.transactionType.value === 'adjustment' && (
          <EditablePreviewField
            label="Reason"
            icon={<FileQuestion className="h-4 w-4" />}
            value={reasonValue}
            onChange={setReasonValue}
            options={ADJUSTMENT_REASONS}
            placeholder="Select reason"
            required={true}
            allowFreeText={false}
          />
        )}

        {/* Location - Now editable for all transaction types */}
        <EditablePreviewField
          label="Location"
          icon={<MapPin className="h-4 w-4" />}
          value={locationId ? locationName : null}
          onChange={handleLocationChange}
          options={locationOptions}
          isLoading={isLoadingLocations}
          placeholder="Select location (optional)"
          required={false}
          allowFreeText={false}
        />

        {/* Notes */}
        {parsed.notes && parsed.notes.value && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Notes</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{parsed.notes.value}</span>
            </div>
          </div>
        )}

        {/* Suggestions */}
        {hasSuggestions && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-2">Suggestions:</p>
            {suggestions.map((suggestion, i) => (
              <div key={i} className="text-sm">
                <span className="font-medium">{suggestion.field}:</span>{' '}
                {suggestion.alternatives.slice(0, 3).map((alt) => alt.label).join(', ')}
              </div>
            ))}
          </div>
        )}

        {/* Original Input */}
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">Original input:</p>
          <p className="text-sm italic">&quot;{parsed.originalInput}&quot;</p>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          <X className="mr-2 h-4 w-4" />
          Cancel
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onEdit} disabled={isSubmitting}>
            <Edit2 className="mr-2 h-4 w-4" />
            Edit Manually
          </Button>
          {onSaveAsDraft && (
            <Button
              variant="secondary"
              onClick={handleSaveAsDraft}
              disabled={isSubmitting || !parsed.itemId.value}
            >
              Save as Draft
            </Button>
          )}
          <Button
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
          >
            <Check className="mr-2 h-4 w-4" />
            {isSubmitting ? 'Submitting...' : 'Confirm & Submit'}
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
