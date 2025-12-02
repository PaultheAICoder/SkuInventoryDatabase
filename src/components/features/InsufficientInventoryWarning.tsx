'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { InsufficientInventoryItem } from '@/types/transaction'

interface InsufficientInventoryWarningProps {
  items: InsufficientInventoryItem[]
  unitsToBuild: number
  skuName?: string
  compact?: boolean
}

export function InsufficientInventoryWarning({
  items,
  unitsToBuild,
  skuName,
  compact = false,
}: InsufficientInventoryWarningProps) {
  if (items.length === 0) return null

  if (compact) {
    return (
      <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-yellow-800">
              Insufficient inventory for {items.length} component{items.length !== 1 ? 's' : ''}
            </p>
            <ul className="mt-1 text-sm text-yellow-700 space-y-0.5">
              {items.slice(0, 3).map((item) => (
                <li key={item.componentId}>
                  {item.componentName}: short {item.shortage.toLocaleString()}
                </li>
              ))}
              {items.length > 3 && (
                <li className="text-yellow-600">+{items.length - 3} more...</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Card className="border-yellow-200 bg-yellow-50/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-yellow-800">
          <AlertTriangle className="h-5 w-5" />
          Insufficient Inventory Warning
        </CardTitle>
        <CardDescription>
          Cannot build {unitsToBuild.toLocaleString()} unit{unitsToBuild !== 1 ? 's' : ''}
          {skuName && <> of <span className="font-medium">{skuName}</span></>} due to component
          shortages
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Component</TableHead>
              <TableHead className="text-right">Required</TableHead>
              <TableHead className="text-right">Available</TableHead>
              <TableHead className="text-right">Shortage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.componentId}>
                <TableCell>
                  <Link
                    href={`/components/${item.componentId}`}
                    className="font-medium hover:underline"
                  >
                    {item.componentName}
                  </Link>
                  <div className="text-xs text-muted-foreground font-mono">{item.skuCode}</div>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {item.required.toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {item.available.toLocaleString()}
                </TableCell>
                <TableCell className="text-right font-mono text-red-600 font-medium">
                  {item.shortage.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-4 text-sm text-yellow-700">
          You can still proceed with the build, but inventory will go negative for these
          components.
        </p>
      </CardContent>
    </Card>
  )
}
