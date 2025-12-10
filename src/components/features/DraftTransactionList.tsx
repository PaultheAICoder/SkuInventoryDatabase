'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  CheckCircle,
  XCircle,
  Package,
  Truck,
  ArrowLeftRight,
  Hash,
  RefreshCw,
  FileX,
} from 'lucide-react'
import type { DraftTransactionResponse } from '@/types/draft'
import { DRAFT_STATUS_CONFIG } from '@/types/draft'
import { toast } from 'sonner'
import { formatDateString } from '@/lib/utils'

interface DraftTransactionListProps {
  initialDrafts?: DraftTransactionResponse[]
  onRefresh?: () => void
}

const transactionTypeConfig = {
  receipt: { label: 'Receipt', icon: Truck, color: 'bg-green-100 text-green-800' },
  build: { label: 'Build', icon: Package, color: 'bg-blue-100 text-blue-800' },
  adjustment: { label: 'Adjustment', icon: Hash, color: 'bg-yellow-100 text-yellow-800' },
  initial: { label: 'Initial', icon: Package, color: 'bg-purple-100 text-purple-800' },
  transfer: { label: 'Transfer', icon: ArrowLeftRight, color: 'bg-orange-100 text-orange-800' },
}

export function DraftTransactionList({ initialDrafts, onRefresh }: DraftTransactionListProps) {
  const router = useRouter()
  const [drafts, setDrafts] = useState<DraftTransactionResponse[]>(initialDrafts || [])
  const [isLoading, setIsLoading] = useState(!initialDrafts)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [isProcessing, setIsProcessing] = useState(false)

  const fetchDrafts = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        status: 'draft',
        pageSize: '50',
      })
      if (typeFilter !== 'all') {
        params.set('type', typeFilter)
      }

      const res = await fetch(`/api/transactions/drafts?${params}`)
      if (res.ok) {
        const data = await res.json()
        setDrafts(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch drafts:', err)
      toast.error('Failed to load drafts')
    } finally {
      setIsLoading(false)
    }
  }, [typeFilter])

  useEffect(() => {
    if (!initialDrafts) {
      fetchDrafts()
    }
  }, [fetchDrafts, initialDrafts])

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(drafts.map((d) => d.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds)
    if (checked) {
      newSelected.add(id)
    } else {
      newSelected.delete(id)
    }
    setSelectedIds(newSelected)
  }

  const handleApprove = async (id: string) => {
    setIsProcessing(true)
    try {
      const res = await fetch(`/api/transactions/drafts/${id}/approve`, {
        method: 'POST',
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to approve')
      }

      toast.success('Draft approved successfully')
      fetchDrafts()
      onRefresh?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve draft')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleReject = async (id: string, reason?: string) => {
    setIsProcessing(true)
    try {
      const res = await fetch(`/api/transactions/drafts/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to reject')
      }

      toast.success('Draft rejected')
      fetchDrafts()
      onRefresh?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject draft')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleBatchApprove = async () => {
    if (selectedIds.size === 0) return

    setIsProcessing(true)
    try {
      const res = await fetch('/api/transactions/drafts/batch-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftIds: Array.from(selectedIds) }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to batch approve')
      }

      toast.success(`Approved ${data.data.succeeded} of ${data.data.total} drafts`)
      setSelectedIds(new Set())
      fetchDrafts()
      onRefresh?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to batch approve')
    } finally {
      setIsProcessing(false)
    }
  }

  const formatDate = (dateStr: string) => {
    return formatDateString(dateStr, {
      month: 'short',
      day: 'numeric',
    })
  }

  const getItemSummary = (draft: DraftTransactionResponse) => {
    if (draft.type === 'build') {
      return `${draft.unitsBuild} x ${draft.sku?.name || 'Unknown SKU'}`
    }
    const line = draft.lines[0]
    if (line) {
      const qty = Math.abs(parseFloat(line.quantityChange))
      return `${qty.toLocaleString()} x ${line.component?.name || 'Unknown'}`
    }
    return '-'
  }

  // Empty state
  if (!isLoading && drafts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileX className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No pending drafts</h3>
          <p className="text-sm text-muted-foreground mt-1">
            All draft transactions have been reviewed
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push('/transactions/new')}
          >
            Create Transaction
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Draft Transactions</CardTitle>
            <CardDescription>
              {drafts.length} draft{drafts.length !== 1 ? 's' : ''} pending review
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Filter type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="receipt">Receipt</SelectItem>
                <SelectItem value="build">Build</SelectItem>
                <SelectItem value="adjustment">Adjustment</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={fetchDrafts}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Batch Actions */}
        {selectedIds.size > 0 && (
          <div className="mb-4 p-3 bg-muted rounded-md flex items-center justify-between">
            <span className="text-sm">
              {selectedIds.size} draft{selectedIds.size !== 1 ? 's' : ''} selected
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleBatchApprove}
                disabled={isProcessing}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Approve Selected
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={selectedIds.size === drafts.length && drafts.length > 0}
                    onCheckedChange={handleSelectAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    Loading drafts...
                  </TableCell>
                </TableRow>
              ) : (
                drafts.map((draft) => {
                  const typeConfig = transactionTypeConfig[draft.type]
                  const TypeIcon = typeConfig.icon
                  const statusConfig = DRAFT_STATUS_CONFIG[draft.status]

                  return (
                    <TableRow key={draft.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(draft.id)}
                          onCheckedChange={(checked) =>
                            handleSelectOne(draft.id, checked as boolean)
                          }
                          aria-label={`Select ${draft.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className={`p-1 rounded ${typeConfig.color}`}>
                            <TypeIcon className="h-3.5 w-3.5" />
                          </div>
                          <span className="text-sm">{typeConfig.label}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {getItemSummary(draft)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {draft.type === 'transfer'
                          ? `${draft.fromLocation?.name || '-'} -> ${draft.toLocation?.name || '-'}`
                          : draft.location?.name || '-'}
                      </TableCell>
                      <TableCell>{formatDate(draft.date)}</TableCell>
                      <TableCell>{draft.createdBy.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            statusConfig.variant === 'warning'
                              ? 'secondary'
                              : statusConfig.variant === 'success'
                                ? 'default'
                                : 'destructive'
                          }
                        >
                          {statusConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {draft.status === 'draft' && (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleReject(draft.id)}
                              disabled={isProcessing}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleApprove(draft.id)}
                              disabled={isProcessing}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
