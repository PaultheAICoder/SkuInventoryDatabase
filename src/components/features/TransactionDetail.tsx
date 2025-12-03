'use client'

import Link from 'next/link'
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
import { Package, Receipt, Minus, Settings } from 'lucide-react'

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

interface TransactionDetailProps {
  transaction: {
    id: string
    type: 'receipt' | 'build' | 'adjustment' | 'initial'
    date: string
    company?: { id: string; name: string }
    sku?: { id: string; name: string; internalCode?: string } | null
    bomVersion?: { id: string; versionName: string } | null
    salesChannel: string | null
    unitsBuild: number | null
    unitBomCost: string | null
    totalBomCost: string | null
    supplier: string | null
    reason: string | null
    notes: string | null
    defectCount: number | null
    defectNotes: string | null
    affectedUnits: number | null
    createdAt: string
    createdBy: { id: string; name: string }
    lines: TransactionLine[]
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
}

export function TransactionDetail({ transaction }: TransactionDetailProps) {
  const config = transactionTypeConfig[transaction.type]
  const Icon = config.icon

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
            <div className="text-right text-sm text-muted-foreground">
              <p>{new Date(transaction.date).toLocaleDateString()}</p>
              <p className="font-mono text-xs">{transaction.id.slice(0, 8)}...</p>
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
                  <p className="text-2xl font-bold">{transaction.unitsBuild?.toLocaleString()}</p>
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
              <div>
                <p className="text-sm text-muted-foreground">Supplier</p>
                <p className="font-medium">{transaction.supplier || '-'}</p>
              </div>
            )}

            {/* Adjustment-specific info */}
            {transaction.type === 'adjustment' && (
              <div>
                <p className="text-sm text-muted-foreground">Reason</p>
                <p className="font-medium">{transaction.reason || '-'}</p>
              </div>
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
              <p className="text-xs text-muted-foreground">
                {new Date(transaction.createdAt).toLocaleString()}
              </p>
            </div>
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
    </div>
  )
}
