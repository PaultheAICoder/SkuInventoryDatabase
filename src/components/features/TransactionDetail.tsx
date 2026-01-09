'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Package, Receipt, Minus, Settings, ArrowLeftRight, PackageMinus, Pencil, Trash2, Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSession } from 'next-auth/react'
import { formatDateString } from '@/lib/utils'
import { TransactionPhotoGallery } from './TransactionPhotoGallery'
import { TransactionPhotoUpload } from './TransactionPhotoUpload'
import type { TransactionPhotoResponse } from '@/types/transaction'

interface TransactionLine {
  id: string
  component: {
    id: string
    name: string
    skuCode: string
    unitOfMeasure?: string
  }
  quantityChange: string
  costPerUnit: string | null
  lineCost?: string | null
}

interface FinishedGoodsLine {
  id: string
  skuId: string
  skuName: string
  skuInternalCode: string
  quantityChange: string
  costPerUnit: string | null
  locationId: string
  locationName: string
}

interface TransactionDetailProps {
  transaction: {
    id: string
    type: 'receipt' | 'build' | 'adjustment' | 'initial' | 'transfer' | 'outbound'
    date: string
    company?: { id: string; name: string }
    sku?: { id: string; name: string; internalCode?: string } | null
    bomVersion?: { id: string; versionName: string } | null
    location?: { id: string; name: string; type?: string } | null
    fromLocation?: { id: string; name: string; type?: string } | null
    toLocation?: { id: string; name: string; type?: string } | null
    salesChannel: string | null
    unitsBuild: number | null
    unitBomCost: string | null
    totalBomCost: string | null
    supplier: string | null
    vendorId?: string | null
    vendor?: { id: string; name: string } | null
    reason: string | null
    notes: string | null
    defectCount: number | null
    defectNotes: string | null
    affectedUnits: number | null
    createdAt: string
    createdBy: { id: string; name: string }
    lines: TransactionLine[]
    finishedGoodsLines?: FinishedGoodsLine[]
    photos?: TransactionPhotoResponse[]
    summary?: {
      componentsConsumed: number
      totalUnitsBuilt: number | null
      totalCost: string | null
    } | null
  }
}

const transactionTypeConfig = {
  receipt: {
    label: 'Receipt',
    icon: Receipt,
    variant: 'success' as const,
    description: 'Inventory received from supplier',
  },
  build: {
    label: 'Build',
    icon: Package,
    variant: 'default' as const,
    description: 'SKU units built from components',
  },
  adjustment: {
    label: 'Adjustment',
    icon: Minus,
    variant: 'warning' as const,
    description: 'Manual inventory adjustment',
  },
  initial: {
    label: 'Initial',
    icon: Settings,
    variant: 'secondary' as const,
    description: 'Initial inventory setup',
  },
  transfer: {
    label: 'Transfer',
    icon: ArrowLeftRight,
    variant: 'default' as const,
    description: 'Inventory transfer between locations',
  },
  outbound: {
    label: 'Outbound',
    icon: PackageMinus,
    variant: 'destructive' as const,
    description: 'SKUs shipped out of warehouse',
  },
}

export function TransactionDetail({ transaction }: TransactionDetailProps) {
  const config = transactionTypeConfig[transaction.type]
  const Icon = config.icon
  const { data: session } = useSession()
  const router = useRouter()

  // Check if user can edit (not a viewer)
  const canEdit = session?.user?.role !== 'viewer'

  // Delete dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Photo state
  const [photos, setPhotos] = useState<TransactionPhotoResponse[]>(transaction.photos || [])
  const [photoError, setPhotoError] = useState<string | null>(null)

  const handlePhotoUploaded = useCallback((photo: TransactionPhotoResponse) => {
    setPhotos((prev) => [...prev, photo])
    setPhotoError(null)
  }, [])

  const handlePhotoDelete = useCallback(async (photoId: string) => {
    try {
      const res = await fetch(`/api/transactions/photos/${photoId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.message || 'Failed to delete photo')
      }

      setPhotos((prev) => prev.filter((p) => p.id !== photoId))
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'Failed to delete photo')
    }
  }, [])

  const handleDelete = async () => {
    setIsDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/transactions/${transaction.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to delete transaction')
      }

      // Redirect to transactions list on success
      router.push('/transactions')
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete transaction')
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Icon className="h-8 w-8 text-muted-foreground" />
              <div>
                <CardTitle className="flex items-center gap-2">
                  {config.label} Transaction
                  <Badge variant={config.variant}>{transaction.type.toUpperCase()}</Badge>
                </CardTitle>
                <CardDescription>{config.description}</CardDescription>
              </div>
            </div>
            <div className="flex items-start gap-4">
              {canEdit && (
                <>
                  <Link href={`/transactions/${transaction.id}/edit`}>
                    <Button variant="outline" size="sm">
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </>
              )}
              <div className="text-right text-sm text-muted-foreground">
                <p suppressHydrationWarning>{formatDateString(transaction.date)}</p>
                <p className="font-mono text-xs">{transaction.id.slice(0, 8)}...</p>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Build-specific info */}
            {transaction.type === 'build' && transaction.sku && (
              <>
                <div>
                  <p className="text-sm text-muted-foreground">SKU</p>
                  <Link
                    href={`/skus/${transaction.sku.id}`}
                    className="font-medium hover:underline"
                  >
                    {transaction.sku.name}
                  </Link>
                  {transaction.sku.internalCode && (
                    <p className="text-xs text-muted-foreground font-mono">
                      {transaction.sku.internalCode}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Units Built</p>
                  <p className="text-2xl font-bold" suppressHydrationWarning>{transaction.unitsBuild?.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total BOM Cost</p>
                  <p className="text-2xl font-bold">
                    ${parseFloat(transaction.totalBomCost || '0').toFixed(2)}
                  </p>
                  {transaction.unitBomCost && (
                    <p className="text-xs text-muted-foreground">
                      ${parseFloat(transaction.unitBomCost).toFixed(4)} per unit
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Receipt-specific info */}
            {transaction.type === 'receipt' && (
              <>
                {transaction.vendor && (
                  <div>
                    <p className="text-sm text-muted-foreground">Vendor</p>
                    <Link
                      href={`/vendors/${transaction.vendor.id}`}
                      className="font-medium hover:underline"
                    >
                      {transaction.vendor.name}
                    </Link>
                  </div>
                )}
                <div>
                  <p className="text-sm text-muted-foreground">Supplier</p>
                  <p className="font-medium">{transaction.supplier || '-'}</p>
                </div>
              </>
            )}

            {/* Adjustment-specific info */}
            {transaction.type === 'adjustment' && (
              <div>
                <p className="text-sm text-muted-foreground">Reason</p>
                <p className="font-medium">{transaction.reason || '-'}</p>
              </div>
            )}

            {/* Transfer-specific info */}
            {transaction.type === 'transfer' && (
              <>
                <div>
                  <p className="text-sm text-muted-foreground">From Location</p>
                  <p className="font-medium">{transaction.fromLocation?.name || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">To Location</p>
                  <p className="font-medium">{transaction.toLocation?.name || '-'}</p>
                </div>
              </>
            )}

            {/* Outbound-specific info */}
            {transaction.type === 'outbound' && transaction.sku && (
              <>
                <div>
                  <p className="text-sm text-muted-foreground">SKU</p>
                  <Link
                    href={`/skus/${transaction.sku.id}`}
                    className="font-medium hover:underline"
                  >
                    {transaction.sku.name}
                  </Link>
                  {transaction.sku.internalCode && (
                    <p className="text-xs text-muted-foreground font-mono">
                      {transaction.sku.internalCode}
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Sales channel if present */}
            {transaction.salesChannel && (
              <div>
                <p className="text-sm text-muted-foreground">Sales Channel</p>
                <p className="font-medium">{transaction.salesChannel}</p>
              </div>
            )}

            {/* BOM version if present */}
            {transaction.bomVersion && (
              <div>
                <p className="text-sm text-muted-foreground">BOM Version</p>
                <p className="font-medium">{transaction.bomVersion.versionName}</p>
              </div>
            )}

            {/* Location if present */}
            {transaction.location && (
              <div>
                <p className="text-sm text-muted-foreground">
                  {transaction.type === 'receipt'
                    ? 'Destination Location'
                    : transaction.type === 'outbound'
                      ? 'Source Location'
                      : 'Location'}
                </p>
                <p className="font-medium">{transaction.location.name}</p>
              </div>
            )}

            {/* Notes */}
            {transaction.notes && (
              <div className="md:col-span-2 lg:col-span-3">
                <p className="text-sm text-muted-foreground">Notes</p>
                <p className="text-sm">{transaction.notes}</p>
              </div>
            )}

            {/* Defect Info (for build transactions with defect data) */}
            {transaction.type === 'build' && (transaction.defectCount || transaction.defectNotes || transaction.affectedUnits) && (
              <div className="md:col-span-2 lg:col-span-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-sm font-medium text-yellow-800 mb-2">Defect Information</p>
                <div className="grid gap-2 md:grid-cols-3">
                  {transaction.defectCount != null && (
                    <div>
                      <p className="text-xs text-yellow-700">Defect Count</p>
                      <p className="font-medium text-yellow-900">{transaction.defectCount}</p>
                    </div>
                  )}
                  {transaction.affectedUnits != null && (
                    <div>
                      <p className="text-xs text-yellow-700">Affected Units</p>
                      <p className="font-medium text-yellow-900">{transaction.affectedUnits}</p>
                    </div>
                  )}
                  {transaction.defectNotes && (
                    <div className="md:col-span-3">
                      <p className="text-xs text-yellow-700">Defect Notes</p>
                      <p className="text-sm text-yellow-900">{transaction.defectNotes}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Metadata */}
            <div>
              <p className="text-sm text-muted-foreground">Created By</p>
              <p className="font-medium">{transaction.createdBy.name}</p>
              <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                {new Date(transaction.createdAt).toLocaleString()}
              </p>
            </div>

            {/* Delete Error Display */}
            {deleteError && (
              <div className="md:col-span-2 lg:col-span-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {deleteError}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Transaction Lines */}
      <Card>
        <CardHeader>
          <CardTitle>
            {transaction.type === 'build' ? 'Components Consumed' : 'Line Items'}
          </CardTitle>
          <CardDescription>
            {transaction.type === 'build'
              ? `${transaction.lines.length} component(s) consumed for this build`
              : `${transaction.lines.length} line item(s) in this transaction`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Component</TableHead>
                <TableHead className="text-right">Quantity Change</TableHead>
                <TableHead className="text-right">Cost/Unit</TableHead>
                <TableHead className="text-right">Line Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transaction.lines.map((line) => {
                const qtyChange = parseFloat(line.quantityChange)
                const costPerUnit = line.costPerUnit ? parseFloat(line.costPerUnit) : null
                const lineCost = line.lineCost
                  ? parseFloat(line.lineCost)
                  : costPerUnit != null
                    ? Math.abs(qtyChange) * costPerUnit
                    : null

                return (
                  <TableRow key={line.id}>
                    <TableCell>
                      <Link
                        href={`/components/${line.component.id}`}
                        className="font-medium hover:underline"
                      >
                        {line.component.name}
                      </Link>
                      <div className="text-xs text-muted-foreground font-mono">
                        {line.component.skuCode}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`font-mono ${qtyChange >= 0 ? 'text-green-600' : 'text-red-600'}`}
                        suppressHydrationWarning
                      >
                        {qtyChange >= 0 ? '+' : ''}
                        {qtyChange.toLocaleString()}
                      </span>
                      {line.component.unitOfMeasure && (
                        <span className="text-muted-foreground text-xs ml-1">
                          {line.component.unitOfMeasure}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {costPerUnit != null ? `$${costPerUnit.toFixed(4)}` : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {lineCost != null ? `$${lineCost.toFixed(2)}` : '-'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          {/* Summary for build transactions */}
          {transaction.type === 'build' && transaction.summary && (
            <div className="mt-4 pt-4 border-t flex justify-end">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total Cost</p>
                <p className="text-xl font-bold">
                  ${parseFloat(transaction.summary.totalCost || '0').toFixed(2)}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Finished Goods Lines - for FG receipt, adjustment, transfer, outbound transactions */}
      {transaction.finishedGoodsLines && transaction.finishedGoodsLines.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Finished Goods</CardTitle>
            <CardDescription>
              {transaction.finishedGoodsLines.length} SKU item(s) in this transaction
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Quantity Change</TableHead>
                  <TableHead className="text-right">Cost/Unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transaction.finishedGoodsLines.map((fgLine) => {
                  const qtyChange = parseFloat(fgLine.quantityChange)
                  const costPerUnit = fgLine.costPerUnit ? parseFloat(fgLine.costPerUnit) : null

                  return (
                    <TableRow key={fgLine.id}>
                      <TableCell>
                        <Link
                          href={`/skus/${fgLine.skuId}`}
                          className="font-medium hover:underline"
                        >
                          {fgLine.skuName}
                        </Link>
                        <div className="text-xs text-muted-foreground font-mono">
                          {fgLine.skuInternalCode}
                        </div>
                      </TableCell>
                      <TableCell>
                        {fgLine.locationName}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`font-mono ${qtyChange >= 0 ? 'text-green-600' : 'text-red-600'}`}
                          suppressHydrationWarning
                        >
                          {qtyChange >= 0 ? '+' : ''}
                          {qtyChange.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {costPerUnit != null ? `$${costPerUnit.toFixed(4)}` : '-'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Photos Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Photos
          </CardTitle>
          <CardDescription>
            {photos.length === 0
              ? 'No photos attached to this transaction'
              : `${photos.length} photo${photos.length !== 1 ? 's' : ''} attached`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {photoError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {photoError}
            </div>
          )}

          {/* Photo Gallery */}
          <TransactionPhotoGallery
            photos={photos}
            canDelete={canEdit}
            onDelete={handlePhotoDelete}
          />

          {/* Upload Section (only for users who can edit) */}
          {canEdit && (
            <div className="pt-4 border-t">
              <h4 className="text-sm font-medium mb-3">Add Photos</h4>
              <TransactionPhotoUpload
                transactionId={transaction.id}
                onUploadComplete={handlePhotoUploaded}
                onError={setPhotoError}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Transaction</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this {transaction.type} transaction from{' '}
              <span suppressHydrationWarning>
                {formatDateString(transaction.date)}
              </span>
              ?
              <span className="block mt-2 font-medium">
                This will reverse all inventory changes made by this transaction.
              </span>
              <span className="block mt-2 text-destructive">
                This action cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete Transaction'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
