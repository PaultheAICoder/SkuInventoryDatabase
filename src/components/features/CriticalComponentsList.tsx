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
import { ReorderStatusBadge } from './ReorderStatusBadge'
import type { ReorderStatus } from '@/types'

interface CriticalComponent {
  id: string
  name: string
  skuCode: string
  quantityOnHand: number
  reorderPoint: number
  reorderStatus: ReorderStatus
}

interface CriticalComponentsListProps {
  components: CriticalComponent[]
}

export function CriticalComponentsList({ components }: CriticalComponentsListProps) {
  if (components.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Critical Components</CardTitle>
          <CardDescription>Components that need immediate attention</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No critical components. All inventory levels are healthy.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Critical Components</CardTitle>
        <CardDescription>Components that need immediate attention</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Component</TableHead>
              <TableHead className="text-right">On Hand</TableHead>
              <TableHead className="text-right">Reorder Point</TableHead>
              <TableHead className="text-right">Deficit</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {components.map((component) => {
              const deficit = component.reorderPoint - component.quantityOnHand
              return (
                <TableRow key={component.id}>
                  <TableCell>
                    <Link
                      href={`/components/${component.id}`}
                      className="font-medium hover:underline"
                    >
                      {component.name}
                    </Link>
                    <div className="text-xs text-muted-foreground font-mono">
                      {component.skuCode}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono" suppressHydrationWarning>
                    {component.quantityOnHand.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono" suppressHydrationWarning>
                    {component.reorderPoint.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono text-red-600" suppressHydrationWarning>
                    -{deficit.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <ReorderStatusBadge status={component.reorderStatus} />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
