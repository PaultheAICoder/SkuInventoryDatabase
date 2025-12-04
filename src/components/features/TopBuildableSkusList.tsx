import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Package } from 'lucide-react'

interface TopBuildableSku {
  id: string
  name: string
  internalCode: string
  maxBuildableUnits: number
  unitCost: string
}

interface TopBuildableSkusListProps {
  skus: TopBuildableSku[]
  locationName?: string
}

export function TopBuildableSkusList({ skus, locationName }: TopBuildableSkusListProps) {
  const description = locationName
    ? `SKUs with the most available inventory for building at ${locationName}`
    : 'SKUs with the most available inventory for building'

  if (skus.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Top Buildable SKUs
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No SKUs with active BOMs and buildable inventory found.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Top Buildable SKUs
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Buildable</TableHead>
              <TableHead className="text-right">Unit Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {skus.map((sku) => (
              <TableRow key={sku.id}>
                <TableCell>
                  <Link
                    href={`/skus/${sku.id}`}
                    className="font-medium hover:underline"
                  >
                    {sku.name}
                  </Link>
                  <div className="text-xs text-muted-foreground font-mono">
                    {sku.internalCode}
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono">
                  <span className={sku.maxBuildableUnits === 0 ? 'text-red-600' : 'text-green-600'} suppressHydrationWarning>
                    {sku.maxBuildableUnits.toLocaleString()}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono">
                  ${parseFloat(sku.unitCost).toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {skus.length > 0 && (
          <div className="mt-4">
            <Link
              href="/skus"
              className="text-sm text-muted-foreground hover:underline"
            >
              View all SKUs
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
