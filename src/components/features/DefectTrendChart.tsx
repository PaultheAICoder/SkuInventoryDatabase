'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { DefectRateTrendPoint } from '@/types/analytics'

interface DefectTrendChartProps {
  data: DefectRateTrendPoint[]
  groupBy: 'day' | 'week' | 'month'
}

export function DefectTrendChart({ data, groupBy }: DefectTrendChartProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    switch (groupBy) {
      case 'day':
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      case 'week':
        return `Week of ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      case 'month':
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    }
  }

  const chartData = data.map((d) => ({
    ...d,
    formattedDate: formatDate(d.date),
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Defect Rate Trend</CardTitle>
        <CardDescription>
          Defect and affected unit rates over time (grouped by {groupBy})
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            No data available for the selected filters
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="formattedDate"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={(value) => `${value}%`}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const tooltipData = payload[0].payload as DefectRateTrendPoint & { formattedDate: string }
                    return (
                      <div className="rounded-lg border bg-background p-3 shadow-lg">
                        <p className="font-medium">{label}</p>
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
                <Line
                  type="monotone"
                  dataKey="defectRate"
                  name="Defect Rate (%)"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ fill: '#ef4444', strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="affectedRate"
                  name="Affected Rate (%)"
                  stroke="#f97316"
                  strokeWidth={2}
                  dot={{ fill: '#f97316', strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
