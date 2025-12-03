'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Trash2, Plus, Loader2, Settings } from 'lucide-react'
import { toast } from 'sonner'
import type { DefectThresholdResponse } from '@/types/alert'

interface SKUOption {
  id: string
  name: string
  internalCode: string
}

interface DefectThresholdConfigProps {
  userRole: string
}

export function DefectThresholdConfig({ userRole }: DefectThresholdConfigProps) {
  const [thresholds, setThresholds] = useState<DefectThresholdResponse[]>([])
  const [skus, setSkus] = useState<SKUOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Form state
  const [selectedSkuId, setSelectedSkuId] = useState<string>('global')
  const [defectRateLimit, setDefectRateLimit] = useState<string>('5')
  const [affectedRateLimit, setAffectedRateLimit] = useState<string>('')

  const isAdmin = userRole === 'admin'

  // Fetch thresholds and SKUs
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [thresholdsRes, skusRes] = await Promise.all([
        fetch('/api/alerts/defects?thresholds=true'),
        fetch('/api/skus'),
      ])

      if (thresholdsRes.ok) {
        const data = await thresholdsRes.json()
        setThresholds(data.data.thresholds)
      }

      if (skusRes.ok) {
        const data = await skusRes.json()
        setSkus(data.data || [])
      }
    } catch (error) {
      console.error('Error fetching threshold data:', error)
      toast.error('Failed to load threshold configuration')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleCreateThreshold = async () => {
    if (!defectRateLimit) {
      toast.error('Please enter a defect rate limit')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/alerts/defects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skuId: selectedSkuId === 'global' ? null : selectedSkuId,
          defectRateLimit: parseFloat(defectRateLimit),
          affectedRateLimit: affectedRateLimit ? parseFloat(affectedRateLimit) : null,
          isActive: true,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.message || 'Failed to create threshold')
      }

      toast.success('Threshold created successfully')
      setDialogOpen(false)
      resetForm()
      fetchData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create threshold')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteThreshold = async (thresholdId: string) => {
    if (!confirm('Are you sure you want to delete this threshold? All associated alerts will also be deleted.')) {
      return
    }

    try {
      const res = await fetch(`/api/alerts/defects/${thresholdId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        throw new Error('Failed to delete threshold')
      }

      toast.success('Threshold deleted')
      fetchData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete threshold')
    }
  }

  const handleToggleActive = async (threshold: DefectThresholdResponse) => {
    try {
      const res = await fetch(`/api/alerts/defects/${threshold.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !threshold.isActive }),
      })

      if (!res.ok) {
        throw new Error('Failed to update threshold')
      }

      toast.success(`Threshold ${threshold.isActive ? 'disabled' : 'enabled'}`)
      fetchData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update threshold')
    }
  }

  const resetForm = () => {
    setSelectedSkuId('global')
    setDefectRateLimit('5')
    setAffectedRateLimit('')
  }

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Defect Thresholds
          </CardTitle>
          <CardDescription>
            View configured defect rate thresholds
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Contact an administrator to modify threshold settings.
          </p>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : thresholds.length === 0 ? (
            <p className="text-sm text-muted-foreground">No thresholds configured.</p>
          ) : (
            <ThresholdsTable
              thresholds={thresholds}
              isAdmin={false}
              onDelete={() => {}}
              onToggle={() => {}}
            />
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Defect Thresholds
            </CardTitle>
            <CardDescription>
              Configure defect rate thresholds for alert generation
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Threshold
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Defect Threshold</DialogTitle>
                <DialogDescription>
                  Set a defect rate limit for a specific SKU or globally.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="sku">SKU (Optional)</Label>
                  <Select value={selectedSkuId} onValueChange={setSelectedSkuId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a SKU" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global">Global (All SKUs)</SelectItem>
                      {skus.map((sku) => (
                        <SelectItem key={sku.id} value={sku.id}>
                          {sku.name} ({sku.internalCode})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    SKU-specific thresholds take priority over global thresholds.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="defectRate">Defect Rate Limit (%)</Label>
                  <Input
                    id="defectRate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={defectRateLimit}
                    onChange={(e) => setDefectRateLimit(e.target.value)}
                    placeholder="e.g., 5.0"
                  />
                  <p className="text-xs text-muted-foreground">
                    Alert will trigger when defect rate exceeds this value.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="affectedRate">Affected Rate Limit (%) - Optional</Label>
                  <Input
                    id="affectedRate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={affectedRateLimit}
                    onChange={(e) => setAffectedRateLimit(e.target.value)}
                    placeholder="e.g., 10.0"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDialogOpen(false)
                    resetForm()
                  }}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button onClick={handleCreateThreshold} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Threshold'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : thresholds.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground mb-4">
              No thresholds configured. Create one to start monitoring defect rates.
            </p>
          </div>
        ) : (
          <ThresholdsTable
            thresholds={thresholds}
            isAdmin={true}
            onDelete={handleDeleteThreshold}
            onToggle={handleToggleActive}
          />
        )}
      </CardContent>
    </Card>
  )
}

interface ThresholdsTableProps {
  thresholds: DefectThresholdResponse[]
  isAdmin: boolean
  onDelete: (id: string) => void
  onToggle: (threshold: DefectThresholdResponse) => void
}

function ThresholdsTable({
  thresholds,
  isAdmin,
  onDelete,
  onToggle,
}: ThresholdsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Scope</TableHead>
          <TableHead className="text-right">Defect Rate Limit</TableHead>
          <TableHead className="text-right">Affected Rate Limit</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created By</TableHead>
          {isAdmin && <TableHead>Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {thresholds.map((threshold) => (
          <TableRow key={threshold.id}>
            <TableCell>
              {threshold.skuName ? (
                <>
                  <span className="font-medium">{threshold.skuName}</span>
                  <div className="text-xs text-muted-foreground font-mono">
                    {threshold.skuCode}
                  </div>
                </>
              ) : (
                <span className="font-medium text-blue-600">Global</span>
              )}
            </TableCell>
            <TableCell className="text-right font-mono" suppressHydrationWarning>
              {threshold.defectRateLimit.toFixed(2)}%
            </TableCell>
            <TableCell className="text-right font-mono text-muted-foreground" suppressHydrationWarning>
              {threshold.affectedRateLimit
                ? `${threshold.affectedRateLimit.toFixed(2)}%`
                : '-'}
            </TableCell>
            <TableCell>
              {threshold.isActive ? (
                <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                  Inactive
                </span>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {threshold.createdBy.name}
            </TableCell>
            {isAdmin && (
              <TableCell>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onToggle(threshold)}
                  >
                    {threshold.isActive ? 'Disable' : 'Enable'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => onDelete(threshold.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
