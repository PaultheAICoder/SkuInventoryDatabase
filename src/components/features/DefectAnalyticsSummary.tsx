import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Activity, AlertCircle, AlertTriangle, Package } from 'lucide-react'
import type { DefectAnalyticsSummary as SummaryType } from '@/types/analytics'

interface DefectAnalyticsSummaryProps {
  summary: SummaryType
}

export function DefectAnalyticsSummary({ summary }: DefectAnalyticsSummaryProps) {
  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Builds</CardTitle>
          <Package className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold" suppressHydrationWarning>{summary.totalBuilds.toLocaleString()}</div>
          <p className="text-xs text-muted-foreground" suppressHydrationWarning>
            {summary.totalUnitsBuilt.toLocaleString()} units built
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Overall Defect Rate</CardTitle>
          <AlertCircle className="h-4 w-4 text-red-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600">{summary.overallDefectRate}%</div>
          <p className="text-xs text-muted-foreground" suppressHydrationWarning>
            {summary.totalDefects.toLocaleString()} total defects
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Affected Rate</CardTitle>
          <AlertTriangle className="h-4 w-4 text-orange-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-orange-600">{summary.overallAffectedRate}%</div>
          <p className="text-xs text-muted-foreground" suppressHydrationWarning>
            {summary.totalAffectedUnits.toLocaleString()} affected units
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Defect Rate Range</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {summary.minDefectRate}% - {summary.maxDefectRate}%
          </div>
          <p className="text-xs text-muted-foreground">Avg: {summary.avgDefectRate}%</p>
        </CardContent>
      </Card>
    </div>
  )
}
