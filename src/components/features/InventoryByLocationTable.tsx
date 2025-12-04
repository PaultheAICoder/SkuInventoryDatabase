'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { MapPin } from 'lucide-react'

interface LocationQuantity {
  locationId: string
  locationName: string
  locationType?: string
  quantity: number
}

interface InventoryByLocationTableProps {
  title?: string
  data: LocationQuantity[]
  totalLabel?: string
  emptyMessage?: string
}

export function InventoryByLocationTable({
  title = 'Inventory by Location',
  data,
  totalLabel = 'Total',
  emptyMessage = 'No inventory data available',
}: InventoryByLocationTableProps) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </CardContent>
      </Card>
    )
  }

  const total = data.reduce((sum, item) => sum + item.quantity, 0)
  const showTotal = data.length > 1

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Location</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow key={item.locationId}>
                <TableCell className="font-medium">{item.locationName}</TableCell>
                <TableCell className="text-muted-foreground capitalize">
                  {item.locationType || '-'}
                </TableCell>
                <TableCell className="text-right font-mono" suppressHydrationWarning>
                  {item.quantity.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
            {showTotal && (
              <TableRow className="border-t-2 font-semibold">
                <TableCell colSpan={2}>{totalLabel}</TableCell>
                <TableCell className="text-right font-mono" suppressHydrationWarning>
                  {total.toLocaleString()}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
