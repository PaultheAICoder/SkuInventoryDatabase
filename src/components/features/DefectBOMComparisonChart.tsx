'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { DefectRateByBOM } from '@/types/analytics'

interface DefectBOMComparisonChartProps {
  data: DefectRateByBOM[]
}

export function DefectBOMComparisonChart({ data }: DefectBOMComparisonChartProps) {
  // Limit to top 10 BOM versions and reverse for chronological order (oldest to newest)
  const chartData = data
    .slice(0, 10)
    .reverse()
    .map((d) => ({
      ...d,
      label: `${d.skuName} - ${d.bomVersionName}`,
      shortLabel: d.bomVersionName.length > 15 ? d.bomVersionName.slice(0, 15) + '...' : d.bomVersionName,
    }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Defect Rate by BOM Version</CardTitle>
        <CardDescription>
          Comparing defect rates across different BOM versions (chronological order)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            No BOM version data available for the selected filters
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="shortLabel"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis
                  tickFormatter={(value) => `${value}%`}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const tooltipData = payload[0].payload as DefectRateByBOM & { label: string }
                    return (
                      <div className="rounded-lg border bg-background p-3 shadow-lg">
                        <p className="font-medium">{tooltipData.label}</p>
                        <p className="text-sm text-muted-foreground">
                          Effective: {tooltipData.effectiveStartDate}
                        </p>
                        <div className="mt-2 space-y-1 text-sm">
                          <p>
                            <span className="text-red-500">Defect Rate:</span> {tooltipData.defectRate}%
                          </p>
                          <p>
                            <span className="text-orange-500">Affected Rate:</span>{' '}
                            {tooltipData.affectedRate}%
                          </p>
                          <p className="text-muted-foreground">
                            {tooltipData.totalDefects} defects / {tooltipData.totalUnitsBuilt} units
                          </p>
                          <p className="text-muted-foreground">{tooltipData.totalBuilds} builds</p>
                        </div>
                      </div>
                    )
                  }}
                />
                <Legend />
                <Bar
                  dataKey="defectRate"
                  name="Defect Rate (%)"
                  fill="#ef4444"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="affectedRate"
                  name="Affected Rate (%)"
                  fill="#f97316"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
