'use client'

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
import { Button } from '@/components/ui/button'
import { AlertTriangle, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import type { DefectAlertResponse } from '@/types/alert'

interface DefectAlertsListProps {
  alerts: DefectAlertResponse[]
  onAcknowledge: (alertId: string) => Promise<void>
  isLoading: boolean
}

function SeverityBadge({ severity }: { severity: 'warning' | 'critical' }) {
  if (severity === 'critical') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
        <AlertCircle className="h-3 w-3" />
        Critical
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700">
      <AlertTriangle className="h-3 w-3" />
      Warning
    </span>
  )
}

export function DefectAlertsList({
  alerts,
  onAcknowledge,
  isLoading,
}: DefectAlertsListProps) {
  if (alerts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Defect Alerts
          </CardTitle>
          <CardDescription>No active defect alerts</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            All builds are within acceptable defect rate thresholds.
          </p>
        </CardContent>
      </Card>
    )
  }

  const criticalCount = alerts.filter((a) => a.severity === 'critical').length
  const warningCount = alerts.filter((a) => a.severity === 'warning').length

  return (
    <Card className="border-yellow-200 bg-yellow-50/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-600" />
          Active Defect Alerts
        </CardTitle>
        <CardDescription>
          {criticalCount > 0 && (
            <span className="text-red-600 font-medium">
              {criticalCount} critical
              {warningCount > 0 && ', '}
            </span>
          )}
          {warningCount > 0 && (
            <span className="text-yellow-600 font-medium">
              {warningCount} warning
            </span>
          )}
          {' '}alert{alerts.length > 1 ? 's' : ''} requiring attention
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Defect Rate</TableHead>
              <TableHead className="text-right">Threshold</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Build Date</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {alerts.map((alert) => (
              <TableRow key={alert.id}>
                <TableCell>
                  <Link
                    href={`/skus/${alert.skuId}`}
                    className="font-medium hover:underline"
                  >
                    {alert.skuName}
                  </Link>
                  <div className="text-xs text-muted-foreground font-mono">
                    {alert.skuCode}
                  </div>
                </TableCell>
                <TableCell
                  className={`text-right font-mono ${
                    alert.severity === 'critical'
                      ? 'text-red-600 font-semibold'
                      : 'text-yellow-600'
                  }`}
                  suppressHydrationWarning
                >
                  {alert.defectRate.toFixed(2)}%
                </TableCell>
                <TableCell className="text-right font-mono" suppressHydrationWarning>
                  {alert.thresholdValue.toFixed(2)}%
                </TableCell>
                <TableCell>
                  <SeverityBadge severity={alert.severity} />
                </TableCell>
                <TableCell className="text-muted-foreground" suppressHydrationWarning>
                  <Link
                    href={`/transactions/${alert.transactionId}`}
                    className="hover:underline"
                  >
                    {alert.transaction.date}
                  </Link>
                  <div className="text-xs">
                    {alert.transaction.defectCount} / {alert.transaction.unitsBuild} units
                  </div>
                </TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onAcknowledge(alert.id)}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Acknowledge'
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
