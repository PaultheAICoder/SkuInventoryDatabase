'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { TransactionTypeSelector, TransactionTypeValue } from './TransactionTypeSelector'
import { AlertTriangle } from 'lucide-react'
import { salesChannels } from '@/types'
import { cn, toLocalDateString } from '@/lib/utils'

interface ComponentOption {
  id: string
  name: string
  internalSku: string
  quantityOnHand: number
}

interface SKUOption {
  id: string
  name: string
  internalCode: string
  maxBuildableUnits: number | null
  hasActiveBom: boolean
  activeBom: object | null
}

interface LocationOption {
  id: string
  name: string
}

// Initial values that can be passed to pre-populate the form
// All fields are optional to support partial pre-fill
export interface QuickEntryFormInitialValues {
  transactionType?: 'inbound' | 'outbound' | 'adjustment' | 'build'
  // Inbound fields
  componentId?: string
  quantity?: number
  supplier?: string
  date?: string  // YYYY-MM-DD format
  locationId?: string
  notes?: string
  // Outbound fields
  skuId?: string
  salesChannel?: string
  // Adjustment fields
  adjustmentType?: 'add' | 'subtract'
  reason?: string
  // Build fields
  unitsToBuild?: number
}

interface QuickEntryFormProps {
  initialValues?: QuickEntryFormInitialValues
}

const ADJUSTMENT_REASONS = [
  { value: 'Inventory count correction', label: 'Inventory count correction' },
  { value: 'Damaged goods', label: 'Damaged goods' },
  { value: 'Lost/missing', label: 'Lost/missing' },
  { value: 'Sample/testing', label: 'Sample/testing' },
  { value: 'Returned to supplier', label: 'Returned to supplier' },
  { value: 'Other', label: 'Other (specify in notes)' },
]

export function QuickEntryForm({ initialValues }: QuickEntryFormProps = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Transaction type state
  const [transactionType, setTransactionType] = useState<TransactionTypeValue>('inbound')

  // Submission states
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Draft mode
  const [saveAsDraft, setSaveAsDraft] = useState(false)

  // Data loading states
  const [isLoadingComponents, setIsLoadingComponents] = useState(true)
  const [isLoadingSkus, setIsLoadingSkus] = useState(true)
  const [isLoadingLocations, setIsLoadingLocations] = useState(true)

  // Options
  const [components, setComponents] = useState<ComponentOption[]>([])
  const [skus, setSkus] = useState<SKUOption[]>([])
  const [locations, setLocations] = useState<LocationOption[]>([])

  // Inbound form data (receiving components)
  const [inboundFormData, setInboundFormData] = useState({
    date: toLocalDateString(new Date()),
    componentId: '',
    quantity: '',
    supplier: '',
    costPerUnit: '',
    locationId: '',
    lotNumber: '',
    expiryDate: '',
    notes: '',
  })

  // Outbound form data (shipping SKUs)
  const [outboundFormData, setOutboundFormData] = useState({
    date: toLocalDateString(new Date()),
    skuId: '',
    salesChannel: '',
    quantity: '',
    locationId: '',
    notes: '',
  })

  // Adjustment form data
  const [adjustmentFormData, setAdjustmentFormData] = useState({
    date: toLocalDateString(new Date()),
    componentId: '',
    adjustmentType: 'subtract' as 'add' | 'subtract',
    quantity: '',
    reason: '',
    locationId: '',
    notes: '',
  })

  // Build form data (building SKUs from components)
  const [buildFormData, setBuildFormData] = useState({
    date: toLocalDateString(new Date()),
    skuId: '',
    unitsToBuild: '',
    salesChannel: '',
    locationId: '',
    notes: '',
  })

  // Build-specific UI state
  const [insufficientItems, setInsufficientItems] = useState<Array<{
    componentId: string
    componentName: string
    required: number
    available: number
    shortage: number
  }>>([])
  const [showBuildWarning, setShowBuildWarning] = useState(false)

  // Initialize from URL params AND/OR initialValues prop
  useEffect(() => {
    // Handle transaction type - URL params take precedence over initialValues
    const typeParam = searchParams.get('type')
    const typeFromProps = initialValues?.transactionType
    const effectiveType = typeParam || typeFromProps

    if (effectiveType && ['inbound', 'outbound', 'adjustment', 'build'].includes(effectiveType)) {
      setTransactionType(effectiveType as TransactionTypeValue)
    }

    // Pre-fill from initialValues prop (for "Edit manually" flow)
    if (initialValues) {
      // Pre-fill inbound form
      if (initialValues.componentId || initialValues.quantity !== undefined || initialValues.supplier || initialValues.date || initialValues.notes) {
        setInboundFormData((prev) => ({
          ...prev,
          componentId: initialValues.componentId || prev.componentId,
          quantity: initialValues.quantity !== undefined ? initialValues.quantity.toString() : prev.quantity,
          supplier: initialValues.supplier || prev.supplier,
          date: initialValues.date || prev.date,
          locationId: initialValues.locationId || prev.locationId,
          notes: initialValues.notes || prev.notes,
        }))
      }

      // Pre-fill outbound form
      if (initialValues.skuId || initialValues.salesChannel || initialValues.quantity !== undefined) {
        setOutboundFormData((prev) => ({
          ...prev,
          skuId: initialValues.skuId || prev.skuId,
          salesChannel: initialValues.salesChannel || prev.salesChannel,
          quantity: initialValues.quantity !== undefined ? initialValues.quantity.toString() : prev.quantity,
          date: initialValues.date || prev.date,
          locationId: initialValues.locationId || prev.locationId,
          notes: initialValues.notes || prev.notes,
        }))
      }

      // Pre-fill adjustment form
      if (initialValues.componentId || initialValues.reason || initialValues.quantity !== undefined) {
        setAdjustmentFormData((prev) => ({
          ...prev,
          componentId: initialValues.componentId || prev.componentId,
          adjustmentType: initialValues.adjustmentType || prev.adjustmentType,
          quantity: initialValues.quantity !== undefined ? Math.abs(initialValues.quantity).toString() : prev.quantity,
          reason: initialValues.reason || prev.reason,
          date: initialValues.date || prev.date,
          locationId: initialValues.locationId || prev.locationId,
          notes: initialValues.notes || prev.notes,
        }))
      }

      // Pre-fill build form
      if (initialValues.skuId || initialValues.unitsToBuild !== undefined || initialValues.salesChannel) {
        setBuildFormData((prev) => ({
          ...prev,
          skuId: initialValues.skuId || prev.skuId,
          unitsToBuild: initialValues.unitsToBuild !== undefined ? initialValues.unitsToBuild.toString() : prev.unitsToBuild,
          salesChannel: initialValues.salesChannel || prev.salesChannel,
          date: initialValues.date || prev.date,
          locationId: initialValues.locationId || prev.locationId,
          notes: initialValues.notes || prev.notes,
        }))
      }
    }

    // Keep existing URL param handling for backward compatibility
    // URL params override initialValues for individual fields
    const channelParam = searchParams.get('channel')
    if (channelParam) {
      setOutboundFormData((prev) => ({ ...prev, salesChannel: channelParam }))
    }

    const componentParam = searchParams.get('componentId')
    if (componentParam) {
      setInboundFormData((prev) => ({ ...prev, componentId: componentParam }))
      setAdjustmentFormData((prev) => ({ ...prev, componentId: componentParam }))
    }

    const skuParam = searchParams.get('skuId')
    if (skuParam) {
      setOutboundFormData((prev) => ({ ...prev, skuId: skuParam }))
      setBuildFormData((prev) => ({ ...prev, skuId: skuParam }))
    }
  }, [searchParams, initialValues])

  // Fetch data on mount
  const fetchComponents = useCallback(async () => {
    setIsLoadingComponents(true)
    try {
      const res = await fetch('/api/components?isActive=true&pageSize=100')
      if (res.ok) {
        const data = await res.json()
        setComponents(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch components:', err)
    } finally {
      setIsLoadingComponents(false)
    }
  }, [])

  const fetchSkus = useCallback(async () => {
    setIsLoadingSkus(true)
    try {
      const res = await fetch('/api/skus?isActive=true&pageSize=100')
      if (res.ok) {
        const data = await res.json()
        // For outbound, show all active SKUs (no BOM filter needed)
        setSkus(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch SKUs:', err)
    } finally {
      setIsLoadingSkus(false)
    }
  }, [])

  const fetchLocations = useCallback(async () => {
    setIsLoadingLocations(true)
    try {
      const res = await fetch('/api/locations?isActive=true&pageSize=50')
      if (res.ok) {
        const data = await res.json()
        setLocations(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch locations:', err)
    } finally {
      setIsLoadingLocations(false)
    }
  }, [])

  useEffect(() => {
    fetchComponents()
    fetchSkus()
    fetchLocations()
  }, [fetchComponents, fetchSkus, fetchLocations])

  // Get selected component for adjustment preview
  const selectedAdjustmentComponent = components.find((c) => c.id === adjustmentFormData.componentId)
  const adjustmentQuantityNum = parseFloat(adjustmentFormData.quantity) || 0
  const newQuantityPreview = selectedAdjustmentComponent
    ? adjustmentFormData.adjustmentType === 'subtract'
      ? selectedAdjustmentComponent.quantityOnHand - adjustmentQuantityNum
      : selectedAdjustmentComponent.quantityOnHand + adjustmentQuantityNum
    : null

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    setIsLoading(true)
    setError(null)
    setSuccessMessage(null)

    try {
      let res: Response
      let endpoint: string
      let payload: Record<string, unknown>

      // If saving as draft, use the draft endpoint
      if (saveAsDraft) {
        endpoint = '/api/transactions/drafts'
        if (transactionType === 'inbound') {
          payload = {
            type: 'receipt',
            componentId: inboundFormData.componentId,
            date: inboundFormData.date,
            quantity: parseFloat(inboundFormData.quantity),
            supplier: inboundFormData.supplier,
            costPerUnit: inboundFormData.costPerUnit ? parseFloat(inboundFormData.costPerUnit) : undefined,
            locationId: inboundFormData.locationId || undefined,
            lotNumber: inboundFormData.lotNumber || undefined,
            expiryDate: inboundFormData.expiryDate || undefined,
            notes: inboundFormData.notes || null,
          }
        } else if (transactionType === 'outbound') {
          payload = {
            type: 'outbound',
            skuId: outboundFormData.skuId,
            date: outboundFormData.date,
            quantity: parseInt(outboundFormData.quantity),
            salesChannel: outboundFormData.salesChannel,
            locationId: outboundFormData.locationId || undefined,
            notes: outboundFormData.notes || null,
          }
        } else if (transactionType === 'build') {
          payload = {
            type: 'build',
            skuId: buildFormData.skuId,
            date: buildFormData.date,
            unitsToBuild: parseInt(buildFormData.unitsToBuild),
            salesChannel: buildFormData.salesChannel || undefined,
            locationId: buildFormData.locationId || undefined,
            notes: buildFormData.notes || null,
          }
        } else {
          // adjustment
          const quantity = parseFloat(adjustmentFormData.quantity)
          const adjustedQuantity = adjustmentFormData.adjustmentType === 'subtract' ? -quantity : quantity
          payload = {
            type: 'adjustment',
            componentId: adjustmentFormData.componentId,
            date: adjustmentFormData.date,
            quantity: adjustedQuantity,
            reason: adjustmentFormData.reason,
            locationId: adjustmentFormData.locationId || undefined,
            notes: adjustmentFormData.notes || null,
          }
        }
      } else if (transactionType === 'inbound') {
        endpoint = '/api/transactions/receipt'
        payload = {
          componentId: inboundFormData.componentId,
          date: inboundFormData.date,
          quantity: parseFloat(inboundFormData.quantity),
          supplier: inboundFormData.supplier,
          costPerUnit: inboundFormData.costPerUnit ? parseFloat(inboundFormData.costPerUnit) : undefined,
          locationId: inboundFormData.locationId || undefined,
          lotNumber: inboundFormData.lotNumber || undefined,
          expiryDate: inboundFormData.expiryDate || undefined,
          notes: inboundFormData.notes || null,
        }
      } else if (transactionType === 'outbound') {
        endpoint = '/api/transactions/outbound'
        payload = {
          skuId: outboundFormData.skuId,
          date: outboundFormData.date,
          quantity: parseInt(outboundFormData.quantity),
          salesChannel: outboundFormData.salesChannel,
          locationId: outboundFormData.locationId || undefined,
          notes: outboundFormData.notes || null,
        }
      } else if (transactionType === 'build') {
        endpoint = '/api/transactions/build'
        payload = {
          skuId: buildFormData.skuId,
          date: buildFormData.date,
          unitsToBuild: parseInt(buildFormData.unitsToBuild),
          salesChannel: buildFormData.salesChannel || undefined,
          locationId: buildFormData.locationId || undefined,
          notes: buildFormData.notes || null,
          allowInsufficientInventory: showBuildWarning,
        }
      } else {
        // adjustment
        endpoint = '/api/transactions/adjustment'
        const quantity = parseFloat(adjustmentFormData.quantity)
        const adjustedQuantity = adjustmentFormData.adjustmentType === 'subtract' ? -quantity : quantity
        payload = {
          componentId: adjustmentFormData.componentId,
          date: adjustmentFormData.date,
          quantity: adjustedQuantity,
          reason: adjustmentFormData.reason,
          locationId: adjustmentFormData.locationId || undefined,
          notes: adjustmentFormData.notes || null,
        }
      }

      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        // Handle insufficient inventory for build transactions
        if (transactionType === 'build' && data?.insufficientItems && data.insufficientItems.length > 0) {
          setInsufficientItems(data.insufficientItems)
          setShowBuildWarning(true)
          return
        }
        throw new Error(data?.message || data?.error || 'Failed to record transaction')
      }

      // Success - clear build warning state on success
      if (transactionType === 'build') {
        setInsufficientItems([])
        setShowBuildWarning(false)
      }

      // Success
      let successText = 'Transaction recorded successfully!'
      const isDraft = saveAsDraft
      if (transactionType === 'inbound') {
        const component = components.find((c) => c.id === inboundFormData.componentId)
        successText = isDraft
          ? `Draft saved: Inbound for +${inboundFormData.quantity} ${component?.name || 'component'}`
          : `Inbound recorded: +${inboundFormData.quantity} ${component?.name || 'component'}`
      } else if (transactionType === 'outbound') {
        const sku = skus.find((s) => s.id === outboundFormData.skuId)
        successText = isDraft
          ? `Draft saved: Outbound for ${outboundFormData.quantity} x ${sku?.name || 'SKU'}`
          : `Outbound recorded: ${outboundFormData.quantity} x ${sku?.name || 'SKU'}`
      } else if (transactionType === 'build') {
        const buildableSkus = skus.filter((s) => s.hasActiveBom)
        const sku = buildableSkus.find((s) => s.id === buildFormData.skuId)
        successText = isDraft
          ? `Draft saved: Build ${buildFormData.unitsToBuild} x ${sku?.name || 'SKU'}`
          : `Build recorded: ${buildFormData.unitsToBuild} x ${sku?.name || 'SKU'}`
      } else {
        const component = components.find((c) => c.id === adjustmentFormData.componentId)
        const sign = adjustmentFormData.adjustmentType === 'add' ? '+' : '-'
        successText = isDraft
          ? `Draft saved: Adjustment for ${sign}${adjustmentFormData.quantity} ${component?.name || 'component'}`
          : `Adjustment recorded: ${sign}${adjustmentFormData.quantity} ${component?.name || 'component'}`
      }

      setSuccessMessage(successText)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  // Handle "Record Another" - reset form but keep transaction type
  const handleRecordAnother = () => {
    setSuccessMessage(null)
    setError(null)

    const today = toLocalDateString(new Date())

    if (transactionType === 'inbound') {
      setInboundFormData({
        date: today,
        componentId: '',
        quantity: '',
        supplier: '',
        costPerUnit: '',
        locationId: '',
        lotNumber: '',
        expiryDate: '',
        notes: '',
      })
    } else if (transactionType === 'outbound') {
      setOutboundFormData({
        date: today,
        skuId: '',
        salesChannel: outboundFormData.salesChannel, // Keep sales channel
        quantity: '',
        locationId: '',
        notes: '',
      })
    } else if (transactionType === 'build') {
      setBuildFormData({
        date: today,
        skuId: '',
        unitsToBuild: '',
        salesChannel: buildFormData.salesChannel, // Keep sales channel
        locationId: '',
        notes: '',
      })
      setInsufficientItems([])
      setShowBuildWarning(false)
    } else {
      setAdjustmentFormData({
        date: today,
        componentId: '',
        adjustmentType: 'subtract',
        quantity: '',
        reason: '',
        locationId: '',
        notes: '',
      })
    }
  }

  // Handle transaction type change - clear success state
  const handleTypeChange = (type: TransactionTypeValue) => {
    setTransactionType(type)
    setSuccessMessage(null)
    setError(null)
  }

  // Render success state
  if (successMessage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Transaction Recorded</CardTitle>
          <CardDescription>Your transaction has been saved successfully.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md bg-green-50 border border-green-200 p-4">
            <p className="font-medium text-green-800">{successMessage}</p>
          </div>
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button type="button" onClick={handleRecordAnother}>
            Record Another
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push('/transactions')}>
            View Transactions
          </Button>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transaction Type</CardTitle>
        <CardDescription>Select the type of transaction you want to record.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6">
          {/* Transaction Type Selector */}
          <TransactionTypeSelector
            value={transactionType}
            onValueChange={handleTypeChange}
            disabled={isLoading}
          />

          {/* Error display */}
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Inbound Form Fields */}
          {transactionType === 'inbound' && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="receipt-date" className="text-right">
                  Date *
                </Label>
                <Input
                  id="receipt-date"
                  type="date"
                  className="col-span-3"
                  value={inboundFormData.date}
                  onChange={(e) => setInboundFormData((prev) => ({ ...prev, date: e.target.value }))}
                  required
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="receipt-component" className="text-right">
                  Component *
                </Label>
                <Select
                  value={inboundFormData.componentId}
                  onValueChange={(value) => setInboundFormData((prev) => ({ ...prev, componentId: value }))}
                  disabled={isLoadingComponents}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder={isLoadingComponents ? 'Loading...' : 'Select component'} />
                  </SelectTrigger>
                  <SelectContent>
                    {components.map((comp) => (
                      <SelectItem key={comp.id} value={comp.id}>
                        <div className="flex items-center justify-between gap-2">
                          <span>{comp.name}</span>
                          <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                            ({comp.quantityOnHand.toLocaleString()} on hand)
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="receipt-quantity" className="text-right">
                  Quantity *
                </Label>
                <Input
                  id="receipt-quantity"
                  type="number"
                  step="1"
                  min="1"
                  className="col-span-3"
                  placeholder="e.g., 100"
                  value={inboundFormData.quantity}
                  onChange={(e) => setInboundFormData((prev) => ({ ...prev, quantity: e.target.value }))}
                  required
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="receipt-supplier" className="text-right">
                  Supplier *
                </Label>
                <Input
                  id="receipt-supplier"
                  className="col-span-3"
                  placeholder="e.g., XYZ Corp"
                  value={inboundFormData.supplier}
                  onChange={(e) => setInboundFormData((prev) => ({ ...prev, supplier: e.target.value }))}
                  required
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="receipt-cost" className="text-right">
                  Cost/Unit
                </Label>
                <Input
                  id="receipt-cost"
                  type="number"
                  step="0.0001"
                  min="0"
                  className="col-span-3"
                  placeholder="Leave blank to use component default"
                  value={inboundFormData.costPerUnit}
                  onChange={(e) => setInboundFormData((prev) => ({ ...prev, costPerUnit: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="receipt-location" className="text-right">
                  Destination Location
                </Label>
                <Select
                  value={inboundFormData.locationId}
                  onValueChange={(value) => setInboundFormData((prev) => ({ ...prev, locationId: value }))}
                  disabled={isLoadingLocations}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder={isLoadingLocations ? 'Loading...' : 'Default location'} />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="receipt-lot" className="text-right">
                  Lot Number
                </Label>
                <Input
                  id="receipt-lot"
                  className="col-span-3"
                  placeholder="e.g., LOT-2024-001"
                  value={inboundFormData.lotNumber}
                  onChange={(e) => setInboundFormData((prev) => ({ ...prev, lotNumber: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="receipt-expiry" className="text-right">
                  Expiry Date
                </Label>
                <Input
                  id="receipt-expiry"
                  type="date"
                  className="col-span-3"
                  value={inboundFormData.expiryDate}
                  onChange={(e) => setInboundFormData((prev) => ({ ...prev, expiryDate: e.target.value }))}
                  disabled={!inboundFormData.lotNumber}
                />
              </div>

              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="receipt-notes" className="text-right pt-2">
                  Notes
                </Label>
                <Textarea
                  id="receipt-notes"
                  className="col-span-3"
                  placeholder="e.g., PO #12345"
                  value={inboundFormData.notes}
                  onChange={(e) => setInboundFormData((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </div>
          )}

          {/* Outbound Form Fields */}
          {transactionType === 'outbound' && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="outbound-date" className="text-right">
                  Date *
                </Label>
                <Input
                  id="outbound-date"
                  type="date"
                  className="col-span-3"
                  value={outboundFormData.date}
                  onChange={(e) => setOutboundFormData((prev) => ({ ...prev, date: e.target.value }))}
                  required
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="outbound-sku" className="text-right">
                  SKU *
                </Label>
                <Select
                  value={outboundFormData.skuId}
                  onValueChange={(value) => setOutboundFormData((prev) => ({ ...prev, skuId: value }))}
                  disabled={isLoadingSkus}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder={isLoadingSkus ? 'Loading SKUs...' : 'Select SKU'} />
                  </SelectTrigger>
                  <SelectContent>
                    {skus.map((sku) => (
                      <SelectItem key={sku.id} value={sku.id}>
                        <div className="flex items-center justify-between gap-2">
                          <span>{sku.name}</span>
                          <span className="text-xs text-muted-foreground">
                            ({sku.internalCode})
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="outbound-channel" className="text-right">
                  Sales Channel *
                </Label>
                <Select
                  value={outboundFormData.salesChannel}
                  onValueChange={(value) => setOutboundFormData((prev) => ({ ...prev, salesChannel: value }))}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {salesChannels.map((channel) => (
                      <SelectItem key={channel} value={channel}>
                        {channel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="outbound-quantity" className="text-right">
                  Quantity *
                </Label>
                <Input
                  id="outbound-quantity"
                  type="number"
                  step="1"
                  min="1"
                  className="col-span-3"
                  placeholder="e.g., 10"
                  value={outboundFormData.quantity}
                  onChange={(e) => setOutboundFormData((prev) => ({ ...prev, quantity: e.target.value }))}
                  required
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="outbound-location" className="text-right">
                  Source Location
                </Label>
                <Select
                  value={outboundFormData.locationId}
                  onValueChange={(value) => setOutboundFormData((prev) => ({ ...prev, locationId: value }))}
                  disabled={isLoadingLocations}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder={isLoadingLocations ? 'Loading...' : 'Default location'} />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="outbound-notes" className="text-right pt-2">
                  Notes
                </Label>
                <Textarea
                  id="outbound-notes"
                  className="col-span-3"
                  placeholder="e.g., Order #12345"
                  value={outboundFormData.notes}
                  onChange={(e) => setOutboundFormData((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </div>
          )}

          {/* Adjustment Form Fields */}
          {transactionType === 'adjustment' && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="adjustment-date" className="text-right">
                  Date *
                </Label>
                <Input
                  id="adjustment-date"
                  type="date"
                  className="col-span-3"
                  value={adjustmentFormData.date}
                  onChange={(e) => setAdjustmentFormData((prev) => ({ ...prev, date: e.target.value }))}
                  required
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="adjustment-component" className="text-right">
                  Component *
                </Label>
                <Select
                  value={adjustmentFormData.componentId}
                  onValueChange={(value) => setAdjustmentFormData((prev) => ({ ...prev, componentId: value }))}
                  disabled={isLoadingComponents}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder={isLoadingComponents ? 'Loading...' : 'Select component'} />
                  </SelectTrigger>
                  <SelectContent>
                    {components.map((comp) => (
                      <SelectItem key={comp.id} value={comp.id}>
                        <div className="flex items-center justify-between gap-2">
                          <span>{comp.name}</span>
                          <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                            ({comp.quantityOnHand.toLocaleString()} on hand)
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="adjustment-type" className="text-right">
                  Type *
                </Label>
                <Select
                  value={adjustmentFormData.adjustmentType}
                  onValueChange={(value: 'add' | 'subtract') =>
                    setAdjustmentFormData((prev) => ({ ...prev, adjustmentType: value }))
                  }
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="subtract">Subtract (remove inventory)</SelectItem>
                    <SelectItem value="add">Add (increase inventory)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="adjustment-quantity" className="text-right">
                  Quantity *
                </Label>
                <Input
                  id="adjustment-quantity"
                  type="number"
                  step="1"
                  min="1"
                  className="col-span-3"
                  placeholder="e.g., 10"
                  value={adjustmentFormData.quantity}
                  onChange={(e) => setAdjustmentFormData((prev) => ({ ...prev, quantity: e.target.value }))}
                  required
                />
              </div>

              {adjustmentFormData.quantity && selectedAdjustmentComponent && (
                <div className="grid grid-cols-4 items-center gap-4">
                  <div className="col-span-1" />
                  <div className="col-span-3 text-sm text-muted-foreground">
                    New quantity will be:{' '}
                    <span className={`font-mono ${newQuantityPreview !== null && newQuantityPreview < 0 ? 'text-destructive' : ''}`}>
                      {newQuantityPreview?.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="adjustment-reason" className="text-right">
                  Reason *
                </Label>
                <Select
                  value={adjustmentFormData.reason}
                  onValueChange={(value) => setAdjustmentFormData((prev) => ({ ...prev, reason: value }))}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {ADJUSTMENT_REASONS.map((reason) => (
                      <SelectItem key={reason.value} value={reason.value}>
                        {reason.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="adjustment-location" className="text-right">
                  Location
                </Label>
                <Select
                  value={adjustmentFormData.locationId}
                  onValueChange={(value) => setAdjustmentFormData((prev) => ({ ...prev, locationId: value }))}
                  disabled={isLoadingLocations}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder={isLoadingLocations ? 'Loading...' : 'Default location'} />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="adjustment-notes" className="text-right pt-2">
                  Notes
                </Label>
                <Textarea
                  id="adjustment-notes"
                  className="col-span-3"
                  placeholder="Additional details..."
                  value={adjustmentFormData.notes}
                  onChange={(e) => setAdjustmentFormData((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </div>
          )}

          {/* Build Form Fields */}
          {transactionType === 'build' && (() => {
            // Get buildable SKUs (only those with active BOMs)
            const buildableSkus = skus.filter((s) => s.hasActiveBom)
            const selectedBuildSku = buildableSkus.find((s) => s.id === buildFormData.skuId)
            const unitsToBuildNum = parseInt(buildFormData.unitsToBuild) || 0
            const exceedsBuildable = selectedBuildSku?.maxBuildableUnits != null && unitsToBuildNum > selectedBuildSku.maxBuildableUnits

            return (
              <div className="space-y-4">
                {/* Warning for insufficient inventory */}
                {showBuildWarning && insufficientItems.length > 0 && (
                  <div className="rounded-md bg-yellow-50 border border-yellow-200 p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="font-medium text-yellow-800">Insufficient Inventory</p>
                        <p className="text-sm text-yellow-700 mt-1">
                          The following components have insufficient inventory:
                        </p>
                        <ul className="mt-2 text-sm text-yellow-700 space-y-1">
                          {insufficientItems.map((item) => (
                            <li key={item.componentId} suppressHydrationWarning>
                              <span className="font-medium">{item.componentName}</span>:{' '}
                              Need {item.required.toLocaleString()}, have {item.available.toLocaleString()}{' '}
                              (short {item.shortage.toLocaleString()})
                            </li>
                          ))}
                        </ul>
                        <div className="mt-4 flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setShowBuildWarning(false)}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            size="sm"
                            variant="destructive"
                            disabled={isLoading}
                          >
                            {isLoading ? 'Building...' : 'Build Anyway'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="build-date" className="text-right">Date *</Label>
                  <Input
                    id="build-date"
                    type="date"
                    className="col-span-3"
                    value={buildFormData.date}
                    onChange={(e) => setBuildFormData((prev) => ({ ...prev, date: e.target.value }))}
                    required
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="build-sku" className="text-right">SKU *</Label>
                  <Select
                    value={buildFormData.skuId}
                    onValueChange={(value) => setBuildFormData((prev) => ({ ...prev, skuId: value }))}
                    disabled={isLoadingSkus}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder={isLoadingSkus ? 'Loading SKUs...' : 'Select SKU to build'} />
                    </SelectTrigger>
                    <SelectContent>
                      {buildableSkus.length === 0 && !isLoadingSkus && (
                        <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                          No SKUs with active BOMs found.<br />Create a BOM for your SKUs first.
                        </div>
                      )}
                      {buildableSkus.map((sku) => (
                        <SelectItem key={sku.id} value={sku.id}>
                          <span suppressHydrationWarning>
                            {sku.name} ({sku.maxBuildableUnits?.toLocaleString() ?? '0'} buildable)
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedBuildSku && (
                  <div className="grid grid-cols-4 items-center gap-4">
                    <div className="col-span-1" />
                    <div className="col-span-3 text-xs text-muted-foreground" suppressHydrationWarning>
                      Max buildable: {selectedBuildSku.maxBuildableUnits?.toLocaleString() ?? '0'} units
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="build-units" className="text-right">Units to Build *</Label>
                  <Input
                    id="build-units"
                    type="number"
                    step="1"
                    min="1"
                    className={cn("col-span-3", exceedsBuildable && "border-yellow-500")}
                    placeholder="e.g., 10"
                    value={buildFormData.unitsToBuild}
                    onChange={(e) => setBuildFormData((prev) => ({ ...prev, unitsToBuild: e.target.value }))}
                    required
                  />
                </div>
                {exceedsBuildable && (
                  <div className="grid grid-cols-4 items-center gap-4">
                    <div className="col-span-1" />
                    <div className="col-span-3 text-xs text-yellow-600" suppressHydrationWarning>
                      Exceeds max buildable ({selectedBuildSku?.maxBuildableUnits?.toLocaleString()})
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="build-channel" className="text-right">Sales Channel</Label>
                  <Select
                    value={buildFormData.salesChannel}
                    onValueChange={(value) => setBuildFormData((prev) => ({ ...prev, salesChannel: value }))}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select channel (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {salesChannels.map((channel) => (
                        <SelectItem key={channel} value={channel}>
                          {channel}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="build-location" className="text-right">Location</Label>
                  <Select
                    value={buildFormData.locationId}
                    onValueChange={(value) => setBuildFormData((prev) => ({ ...prev, locationId: value }))}
                    disabled={isLoadingLocations}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder={isLoadingLocations ? 'Loading...' : 'Default location'} />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-4 items-start gap-4">
                  <Label htmlFor="build-notes" className="text-right pt-2">Notes</Label>
                  <Textarea
                    id="build-notes"
                    className="col-span-3"
                    placeholder="e.g., Order batch #123"
                    value={buildFormData.notes}
                    onChange={(e) => setBuildFormData((prev) => ({ ...prev, notes: e.target.value }))}
                  />
                </div>
              </div>
            )
          })()}
        </CardContent>

        <CardFooter className="flex flex-col gap-4">
            {/* Save as Draft Option */}
            <div className="w-full flex items-center space-x-2 border-t pt-4">
              <Checkbox
                id="saveAsDraft"
                checked={saveAsDraft}
                onCheckedChange={(checked) => setSaveAsDraft(checked as boolean)}
              />
              <label
                htmlFor="saveAsDraft"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Save as draft (requires review before applying to inventory)
              </label>
            </div>

            {/* Action Buttons */}
            <div className="w-full flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/transactions')}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  isLoading ||
                  (transactionType === 'inbound' && (!inboundFormData.componentId || !inboundFormData.quantity || !inboundFormData.supplier)) ||
                  (transactionType === 'outbound' && (!outboundFormData.skuId || !outboundFormData.quantity || !outboundFormData.salesChannel)) ||
                  (transactionType === 'adjustment' && (!adjustmentFormData.componentId || !adjustmentFormData.quantity || !adjustmentFormData.reason)) ||
                  (transactionType === 'build' && (!buildFormData.skuId || !buildFormData.unitsToBuild))
                }
              >
                {isLoading ? (saveAsDraft ? 'Saving...' : 'Recording...') : (saveAsDraft ? 'Save Draft' : 'Record Transaction')}
              </Button>
            </div>
        </CardFooter>
      </form>
    </Card>
  )
}
