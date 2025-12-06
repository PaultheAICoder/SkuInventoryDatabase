'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Plus, Trash2 } from 'lucide-react'
import type { ComponentResponse } from '@/types/component'
import type { BOMVersionResponse } from '@/types/bom'
import { parseFractionOrNumber } from '@/lib/utils'

interface BOMLine {
  componentId: string
  componentName: string
  quantityPerUnit: string
  costPerUnit: string
  notes: string
}

interface BOMVersionEditFormProps {
  bomVersionId: string
  skuId: string
  skuName: string
  initialData: BOMVersionResponse
  onSuccess?: () => void
}

export function BOMVersionEditForm({
  bomVersionId,
  skuId,
  skuName,
  initialData,
  onSuccess
}: BOMVersionEditFormProps) {
  const router = useRouter()

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [components, setComponents] = useState<ComponentResponse[]>([])
  const [loadingComponents, setLoadingComponents] = useState(true)

  const [formData, setFormData] = useState({
    versionName: initialData.versionName,
    effectiveStartDate: initialData.effectiveStartDate,
    notes: initialData.notes || '',
    defectNotes: initialData.defectNotes || '',
  })

  const [lines, setLines] = useState<BOMLine[]>(
    initialData.lines.map((line) => ({
      componentId: line.component.id,
      componentName: line.component.name,
      quantityPerUnit: line.quantityPerUnit,
      costPerUnit: line.component.costPerUnit,
      notes: line.notes || '',
    }))
  )

  useEffect(() => {
    async function fetchComponents() {
      try {
        const res = await fetch('/api/components?isActive=true&pageSize=100')
        if (res.ok) {
          const data = await res.json().catch(() => ({}))
          setComponents(data?.data || [])
        }
      } catch (err) {
        console.error('Failed to fetch components:', err)
      } finally {
        setLoadingComponents(false)
      }
    }
    fetchComponents()
  }, [])

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      { componentId: '', componentName: '', quantityPerUnit: '1', costPerUnit: '0', notes: '' },
    ])
  }

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  const updateLine = (index: number, field: keyof BOMLine, value: string) => {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line
        if (field === 'componentId') {
          const component = components.find((c) => c.id === value)
          return {
            ...line,
            componentId: value,
            componentName: component?.name ?? '',
            costPerUnit: component?.costPerUnit ?? '0',
          }
        }
        return { ...line, [field]: value }
      })
    )
  }

  const calculateTotalCost = () => {
    return lines.reduce((total, line) => {
      const qty = parseFractionOrNumber(line.quantityPerUnit) ?? 0
      const cost = parseFloat(line.costPerUnit) || 0
      return total + qty * cost
    }, 0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    if (lines.length === 0) {
      setError('At least one component is required')
      setIsLoading(false)
      return
    }

    if (lines.some((line) => !line.componentId)) {
      setError('All lines must have a component selected')
      setIsLoading(false)
      return
    }

    try {
      const res = await fetch(`/api/bom-versions/${bomVersionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionName: formData.versionName,
          effectiveStartDate: formData.effectiveStartDate,
          notes: formData.notes || null,
          defectNotes: formData.defectNotes || null,
          lines: lines.map((line) => ({
            componentId: line.componentId,
            quantityPerUnit: line.quantityPerUnit,
            notes: line.notes || null,
          })),
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.message || 'Failed to update BOM version')
      }

      if (onSuccess) {
        onSuccess()
      } else {
        router.push(`/skus/${skuId}`)
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const availableComponents = components.filter(
    (c) => !lines.some((line) => line.componentId === c.id)
  )

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Edit BOM Version for {skuName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="versionName">Version Name *</Label>
              <Input
                id="versionName"
                value={formData.versionName}
                onChange={(e) => setFormData((prev) => ({ ...prev, versionName: e.target.value }))}
                placeholder="e.g., v1, v2-cheaper-mailer"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="effectiveStartDate">Effective Start Date *</Label>
              <Input
                id="effectiveStartDate"
                type="date"
                value={formData.effectiveStartDate}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, effectiveStartDate: e.target.value }))
                }
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={formData.notes}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Reason for this version..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="defectNotes">Defect Notes</Label>
            <textarea
              id="defectNotes"
              className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={formData.defectNotes}
              onChange={(e) => setFormData((prev) => ({ ...prev, defectNotes: e.target.value }))}
              placeholder="Document any known defects or quality issues with this BOM version..."
            />
          </div>

          {/* BOM Lines */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Components *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addLine}
                disabled={loadingComponents || availableComponents.length === 0}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Component
              </Button>
            </div>

            {loadingComponents ? (
              <p className="text-sm text-muted-foreground">Loading components...</p>
            ) : lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No components added. Click &quot;Add Component&quot; to start building the BOM.
              </p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[250px]">Component</TableHead>
                      <TableHead className="w-[100px]">Qty/Unit</TableHead>
                      <TableHead className="text-right w-[100px]">Cost/Unit</TableHead>
                      <TableHead className="text-right w-[100px]">Line Cost</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, index) => {
                      const lineCost =
                        (parseFractionOrNumber(line.quantityPerUnit) ?? 0) *
                        (parseFloat(line.costPerUnit) || 0)
                      return (
                        <TableRow key={index}>
                          <TableCell>
                            <Select
                              value={line.componentId}
                              onValueChange={(value) => updateLine(index, 'componentId', value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select component" />
                              </SelectTrigger>
                              <SelectContent>
                                {line.componentId && (
                                  <SelectItem value={line.componentId}>
                                    {line.componentName}
                                  </SelectItem>
                                )}
                                {availableComponents.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.name} ({c.skuCode})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="text"
                              value={line.quantityPerUnit}
                              onChange={(e) =>
                                updateLine(index, 'quantityPerUnit', e.target.value)
                              }
                              placeholder="e.g., 1, 0.5, 1/45"
                              className="w-full"
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            ${parseFloat(line.costPerUnit).toFixed(4)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            ${lineCost.toFixed(4)}
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeLine(index)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    {lines.length > 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-right font-medium">
                          Total Unit Cost:
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          ${calculateTotalCost().toFixed(4)}
                        </TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading || lines.length === 0}>
            {isLoading ? 'Saving...' : 'Save Changes'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
