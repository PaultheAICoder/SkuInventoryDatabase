'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
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
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import type { TransactionResponse } from '@/types/transaction'
import { salesChannels } from '@/types'

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
}

interface LocationOption {
  id: string
  name: string
}

const ADJUSTMENT_REASONS = [
  { value: 'Inventory count correction', label: 'Inventory count correction' },
  { value: 'Damaged goods', label: 'Damaged goods' },
  { value: 'Lost/missing', label: 'Lost/missing' },
  { value: 'Sample/testing', label: 'Sample/testing' },
  { value: 'Returned to supplier', label: 'Returned to supplier' },
  { value: 'Other', label: 'Other (specify in notes)' },
]

export default function EditTransactionPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [transaction, setTransaction] = useState<TransactionResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Reference data
  const [components, setComponents] = useState<ComponentOption[]>([])
  const [skus, setSkus] = useState<SKUOption[]>([])
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [isLoadingRefs, setIsLoadingRefs] = useState(true)

  // Form state for different transaction types
  const [formData, setFormData] = useState<Record<string, unknown>>({})

  // Fetch reference data
  const fetchReferenceData = useCallback(async () => {
    setIsLoadingRefs(true)
    try {
      const [componentsRes, skusRes, locationsRes] = await Promise.all([
        fetch('/api/components?isActive=true&pageSize=100'),
        fetch('/api/skus?isActive=true&pageSize=100'),
        fetch('/api/locations?isActive=true&pageSize=50'),
      ])

      if (componentsRes.ok) {
        const data = await componentsRes.json()
        setComponents(data.data || [])
      }
      if (skusRes.ok) {
        const data = await skusRes.json()
        setSkus(data.data || [])
      }
      if (locationsRes.ok) {
        const data = await locationsRes.json()
        setLocations(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch reference data:', err)
    } finally {
      setIsLoadingRefs(false)
    }
  }, [])

  // Fetch transaction and initialize form
  useEffect(() => {
    async function fetchTransaction() {
      try {
        const res = await fetch(`/api/transactions/${id}`)
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error('Transaction not found')
          }
          throw new Error('Failed to load transaction')
        }
        const data = await res.json()
        const tx = data.data as TransactionResponse
        setTransaction(tx)
        initializeFormData(tx)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setIsLoading(false)
      }
    }

    fetchTransaction()
    fetchReferenceData()
  }, [id, fetchReferenceData])

  // Initialize form data based on transaction type
  const initializeFormData = (tx: TransactionResponse) => {
    const baseData = {
      date: tx.date,
      notes: tx.notes || '',
      locationId: tx.locationId || '',
    }

    switch (tx.type) {
      case 'receipt': {
        const firstLine = tx.lines[0]
        setFormData({
          ...baseData,
          componentId: firstLine?.component.id || '',
          quantity: firstLine ? Math.abs(parseFloat(firstLine.quantityChange)).toString() : '',
          supplier: tx.supplier || '',
          costPerUnit: firstLine?.costPerUnit || '',
        })
        break
      }
      case 'adjustment': {
        const firstLine = tx.lines[0]
        const quantity = firstLine ? parseFloat(firstLine.quantityChange) : 0
        setFormData({
          ...baseData,
          componentId: firstLine?.component.id || '',
          quantity: Math.abs(quantity).toString(),
          adjustmentType: quantity >= 0 ? 'add' : 'subtract',
          reason: tx.reason || '',
        })
        break
      }
      case 'initial': {
        const firstLine = tx.lines[0]
        setFormData({
          ...baseData,
          componentId: firstLine?.component.id || '',
          quantity: firstLine ? Math.abs(parseFloat(firstLine.quantityChange)).toString() : '',
          costPerUnit: firstLine?.costPerUnit || '',
        })
        break
      }
      case 'transfer': {
        const firstLine = tx.lines[0]
        // For transfers, first line is negative (from), second is positive (to)
        const quantity = firstLine ? Math.abs(parseFloat(firstLine.quantityChange)) : 0
        setFormData({
          date: tx.date,
          notes: tx.notes || '',
          componentId: firstLine?.component.id || '',
          quantity: quantity.toString(),
          fromLocationId: tx.fromLocationId || '',
          toLocationId: tx.toLocationId || '',
        })
        break
      }
      case 'build':
        setFormData({
          ...baseData,
          unitsToBuild: tx.unitsBuild?.toString() || '',
          salesChannel: tx.salesChannel || '',
          defectCount: tx.defectCount?.toString() || '',
          defectNotes: tx.defectNotes || '',
          affectedUnits: tx.affectedUnits?.toString() || '',
        })
        break
      case 'outbound':
        setFormData({
          ...baseData,
          skuId: tx.sku?.id || '',
          salesChannel: tx.salesChannel || '',
          quantity: '', // Will be fetched from finished goods lines
        })
        break
    }
  }

  const handleInputChange = (field: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!transaction) return

    setIsSaving(true)
    setError(null)
    setSuccessMessage(null)

    try {
      // Build payload based on transaction type
      let payload: Record<string, unknown> = {}

      switch (transaction.type) {
        case 'receipt':
          payload = {
            date: formData.date,
            componentId: formData.componentId,
            quantity: parseFloat(formData.quantity as string),
            supplier: formData.supplier,
            costPerUnit: formData.costPerUnit ? parseFloat(formData.costPerUnit as string) : undefined,
            locationId: formData.locationId || undefined,
            notes: formData.notes || null,
          }
          break
        case 'adjustment': {
          const quantity = parseFloat(formData.quantity as string)
          const adjustedQuantity = formData.adjustmentType === 'subtract' ? -quantity : quantity
          payload = {
            date: formData.date,
            componentId: formData.componentId,
            quantity: adjustedQuantity,
            reason: formData.reason,
            locationId: formData.locationId || undefined,
            notes: formData.notes || null,
          }
          break
        }
        case 'initial':
          payload = {
            date: formData.date,
            componentId: formData.componentId,
            quantity: parseFloat(formData.quantity as string),
            costPerUnit: formData.costPerUnit ? parseFloat(formData.costPerUnit as string) : undefined,
            locationId: formData.locationId || undefined,
            notes: formData.notes || null,
          }
          break
        case 'transfer':
          payload = {
            date: formData.date,
            componentId: formData.componentId,
            quantity: parseFloat(formData.quantity as string),
            fromLocationId: formData.fromLocationId,
            toLocationId: formData.toLocationId,
            notes: formData.notes || null,
          }
          break
        case 'build':
          payload = {
            date: formData.date,
            unitsToBuild: parseInt(formData.unitsToBuild as string),
            salesChannel: formData.salesChannel || undefined,
            defectCount: formData.defectCount ? parseInt(formData.defectCount as string) : null,
            defectNotes: formData.defectNotes || null,
            affectedUnits: formData.affectedUnits ? parseInt(formData.affectedUnits as string) : null,
            locationId: formData.locationId || undefined,
            notes: formData.notes || null,
          }
          break
        case 'outbound':
          payload = {
            date: formData.date,
            skuId: formData.skuId,
            salesChannel: formData.salesChannel,
            quantity: parseInt(formData.quantity as string),
            locationId: formData.locationId || undefined,
            notes: formData.notes || null,
          }
          break
      }

      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update transaction')
      }

      setSuccessMessage('Transaction updated successfully!')
      // Redirect after a short delay
      setTimeout(() => {
        router.push(`/transactions/${id}`)
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-4">
          <Link href={`/transactions/${id}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Transaction
            </Button>
          </Link>
        </div>
        <div className="h-64 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (error && !transaction) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/transactions">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Transactions
            </Button>
          </Link>
        </div>
        <div className="rounded-md bg-destructive/10 p-6 text-center">
          <p className="text-destructive">{error}</p>
        </div>
      </div>
    )
  }

  if (!transaction) return null

  const transactionTypeLabels: Record<string, string> = {
    receipt: 'Receipt',
    adjustment: 'Adjustment',
    initial: 'Initial',
    transfer: 'Transfer',
    build: 'Build',
    outbound: 'Outbound',
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/transactions/${id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Transaction
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-bold">Edit Transaction</h1>
        <p className="text-muted-foreground">
          Editing {transactionTypeLabels[transaction.type]} transaction
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle>{transactionTypeLabels[transaction.type]} Details</CardTitle>
            <CardDescription>
              Update the transaction details. Changes will immediately recalculate inventory.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Error display */}
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Success display */}
            {successMessage && (
              <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800">
                {successMessage}
              </div>
            )}

            {/* Common: Date field */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="date" className="text-right">
                Date *
              </Label>
              <Input
                id="date"
                type="date"
                className="col-span-3"
                value={formData.date as string}
                onChange={(e) => handleInputChange('date', e.target.value)}
                required
              />
            </div>

            {/* Receipt-specific fields */}
            {transaction.type === 'receipt' && (
              <>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="componentId" className="text-right">
                    Component *
                  </Label>
                  <Select
                    value={formData.componentId as string}
                    onValueChange={(value) => handleInputChange('componentId', value)}
                    disabled={isLoadingRefs}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder={isLoadingRefs ? 'Loading...' : 'Select component'} />
                    </SelectTrigger>
                    <SelectContent>
                      {components.map((comp) => (
                        <SelectItem key={comp.id} value={comp.id}>
                          {comp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="quantity" className="text-right">
                    Quantity *
                  </Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="1"
                    min="1"
                    className="col-span-3"
                    value={formData.quantity as string}
                    onChange={(e) => handleInputChange('quantity', e.target.value)}
                    required
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="supplier" className="text-right">
                    Supplier *
                  </Label>
                  <Input
                    id="supplier"
                    className="col-span-3"
                    value={formData.supplier as string}
                    onChange={(e) => handleInputChange('supplier', e.target.value)}
                    required
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="costPerUnit" className="text-right">
                    Cost/Unit
                  </Label>
                  <Input
                    id="costPerUnit"
                    type="number"
                    step="0.0001"
                    min="0"
                    className="col-span-3"
                    value={formData.costPerUnit as string}
                    onChange={(e) => handleInputChange('costPerUnit', e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Adjustment-specific fields */}
            {transaction.type === 'adjustment' && (
              <>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="componentId" className="text-right">
                    Component *
                  </Label>
                  <Select
                    value={formData.componentId as string}
                    onValueChange={(value) => handleInputChange('componentId', value)}
                    disabled={isLoadingRefs}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder={isLoadingRefs ? 'Loading...' : 'Select component'} />
                    </SelectTrigger>
                    <SelectContent>
                      {components.map((comp) => (
                        <SelectItem key={comp.id} value={comp.id}>
                          {comp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="adjustmentType" className="text-right">
                    Type *
                  </Label>
                  <Select
                    value={formData.adjustmentType as string}
                    onValueChange={(value) => handleInputChange('adjustmentType', value)}
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
                  <Label htmlFor="quantity" className="text-right">
                    Quantity *
                  </Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="1"
                    min="1"
                    className="col-span-3"
                    value={formData.quantity as string}
                    onChange={(e) => handleInputChange('quantity', e.target.value)}
                    required
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="reason" className="text-right">
                    Reason *
                  </Label>
                  <Select
                    value={formData.reason as string}
                    onValueChange={(value) => handleInputChange('reason', value)}
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
              </>
            )}

            {/* Initial-specific fields */}
            {transaction.type === 'initial' && (
              <>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="componentId" className="text-right">
                    Component *
                  </Label>
                  <Select
                    value={formData.componentId as string}
                    onValueChange={(value) => handleInputChange('componentId', value)}
                    disabled={isLoadingRefs}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder={isLoadingRefs ? 'Loading...' : 'Select component'} />
                    </SelectTrigger>
                    <SelectContent>
                      {components.map((comp) => (
                        <SelectItem key={comp.id} value={comp.id}>
                          {comp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="quantity" className="text-right">
                    Quantity *
                  </Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="1"
                    min="1"
                    className="col-span-3"
                    value={formData.quantity as string}
                    onChange={(e) => handleInputChange('quantity', e.target.value)}
                    required
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="costPerUnit" className="text-right">
                    Cost/Unit
                  </Label>
                  <Input
                    id="costPerUnit"
                    type="number"
                    step="0.0001"
                    min="0"
                    className="col-span-3"
                    value={formData.costPerUnit as string}
                    onChange={(e) => handleInputChange('costPerUnit', e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Transfer-specific fields */}
            {transaction.type === 'transfer' && (
              <>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="componentId" className="text-right">
                    Component *
                  </Label>
                  <Select
                    value={formData.componentId as string}
                    onValueChange={(value) => handleInputChange('componentId', value)}
                    disabled={isLoadingRefs}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder={isLoadingRefs ? 'Loading...' : 'Select component'} />
                    </SelectTrigger>
                    <SelectContent>
                      {components.map((comp) => (
                        <SelectItem key={comp.id} value={comp.id}>
                          {comp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="quantity" className="text-right">
                    Quantity *
                  </Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="1"
                    min="1"
                    className="col-span-3"
                    value={formData.quantity as string}
                    onChange={(e) => handleInputChange('quantity', e.target.value)}
                    required
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="fromLocationId" className="text-right">
                    From Location *
                  </Label>
                  <Select
                    value={formData.fromLocationId as string}
                    onValueChange={(value) => handleInputChange('fromLocationId', value)}
                    disabled={isLoadingRefs}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder={isLoadingRefs ? 'Loading...' : 'Select location'} />
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
                  <Label htmlFor="toLocationId" className="text-right">
                    To Location *
                  </Label>
                  <Select
                    value={formData.toLocationId as string}
                    onValueChange={(value) => handleInputChange('toLocationId', value)}
                    disabled={isLoadingRefs}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder={isLoadingRefs ? 'Loading...' : 'Select location'} />
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
              </>
            )}

            {/* Build-specific fields */}
            {transaction.type === 'build' && (
              <>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">SKU</Label>
                  <div className="col-span-3 text-sm text-muted-foreground">
                    {transaction.sku?.name}
                  </div>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="unitsToBuild" className="text-right">
                    Units to Build *
                  </Label>
                  <Input
                    id="unitsToBuild"
                    type="number"
                    step="1"
                    min="1"
                    className="col-span-3"
                    value={formData.unitsToBuild as string}
                    onChange={(e) => handleInputChange('unitsToBuild', e.target.value)}
                    required
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="salesChannel" className="text-right">
                    Sales Channel
                  </Label>
                  <Select
                    value={formData.salesChannel as string}
                    onValueChange={(value) => handleInputChange('salesChannel', value)}
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
                  <Label htmlFor="defectCount" className="text-right">
                    Defect Count
                  </Label>
                  <Input
                    id="defectCount"
                    type="number"
                    step="1"
                    min="0"
                    className="col-span-3"
                    value={formData.defectCount as string}
                    onChange={(e) => handleInputChange('defectCount', e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-4 items-start gap-4">
                  <Label htmlFor="defectNotes" className="text-right pt-2">
                    Defect Notes
                  </Label>
                  <Textarea
                    id="defectNotes"
                    className="col-span-3"
                    value={formData.defectNotes as string}
                    onChange={(e) => handleInputChange('defectNotes', e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Outbound-specific fields */}
            {transaction.type === 'outbound' && (
              <>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="skuId" className="text-right">
                    SKU *
                  </Label>
                  <Select
                    value={formData.skuId as string}
                    onValueChange={(value) => handleInputChange('skuId', value)}
                    disabled={isLoadingRefs}
                  >
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder={isLoadingRefs ? 'Loading...' : 'Select SKU'} />
                    </SelectTrigger>
                    <SelectContent>
                      {skus.map((sku) => (
                        <SelectItem key={sku.id} value={sku.id}>
                          {sku.name} ({sku.internalCode})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="salesChannel" className="text-right">
                    Sales Channel *
                  </Label>
                  <Select
                    value={formData.salesChannel as string}
                    onValueChange={(value) => handleInputChange('salesChannel', value)}
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
                  <Label htmlFor="quantity" className="text-right">
                    Quantity *
                  </Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="1"
                    min="1"
                    className="col-span-3"
                    value={formData.quantity as string}
                    onChange={(e) => handleInputChange('quantity', e.target.value)}
                    required
                  />
                </div>
              </>
            )}

            {/* Common: Location field (not for transfer which has from/to) */}
            {transaction.type !== 'transfer' && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="locationId" className="text-right">
                  Location
                </Label>
                <Select
                  value={formData.locationId as string}
                  onValueChange={(value) => handleInputChange('locationId', value)}
                  disabled={isLoadingRefs}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder={isLoadingRefs ? 'Loading...' : 'Default location'} />
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
            )}

            {/* Common: Notes field */}
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="notes" className="text-right pt-2">
                Notes
              </Label>
              <Textarea
                id="notes"
                className="col-span-3"
                value={formData.notes as string}
                onChange={(e) => handleInputChange('notes', e.target.value)}
              />
            </div>
          </CardContent>

          <CardFooter className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(`/transactions/${id}`)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
