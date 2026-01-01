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
import { Loader2 } from 'lucide-react'
import { formatDateString } from '@/lib/utils'
import type { AcosRoasDataPoint } from '@/types/amazon-analytics'

interface AcosRoasChartProps {
  data: AcosRoasDataPoint[]
  isLoading?: boolean
}

// Color scheme
const COLORS = {
  acos: '#ef4444', // red-500
  roas: '#22c55e', // green-500
}

// Format currency for display
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function AcosRoasChart({ data, isLoading }: AcosRoasChartProps) {
  // Transform data to include formatted dates
  const chartData = data.map((d) => ({
    ...d,
    formattedDate: formatDateString(d.date, { month: 'short', day: 'numeric' }),
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>ACOS & ROAS Trends</CardTitle>
        <CardDescription>
          Advertising Cost of Sales (ACOS) and Return on Ad Spend (ROAS) over time
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-80 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-80 items-center justify-center text-muted-foreground">
            No ACOS/ROAS data available
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 50, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="formattedDate"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  yAxisId="left"
                  orientation="left"
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  label={{
                    value: 'ACOS %',
                    angle: -90,
                    position: 'insideLeft',
                    style: { textAnchor: 'middle', fill: COLORS.acos },
                  }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={(v) => `${v}x`}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  label={{
                    value: 'ROAS',
                    angle: 90,
                    position: 'insideRight',
                    style: { textAnchor: 'middle', fill: COLORS.roas },
                  }}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const tooltipData = payload[0].payload as AcosRoasDataPoint & { formattedDate: string }
                    return (
                      <div className="rounded-lg border bg-background p-3 shadow-lg">
                        <p className="font-medium">{label}</p>
                        <div className="mt-2 space-y-1 text-sm">
                          <p>
                            <span style={{ color: COLORS.acos }}>ACOS:</span>{' '}
                            {tooltipData.acos.toFixed(1)}%
                          </p>
                          <p className="text-xs text-muted-foreground ml-4">
                            (Ad Cost / Sales)
                          </p>
                          <p>
                            <span style={{ color: COLORS.roas }}>ROAS:</span>{' '}
                            {tooltipData.roas.toFixed(2)}x
                          </p>
                          <p className="text-xs text-muted-foreground ml-4">
                            (Sales / Ad Cost)
                          </p>
                          <div className="mt-2 border-t pt-2">
                            <p className="text-muted-foreground">
                              Spend: {formatCurrency(tooltipData.spend)}
                            </p>
                            <p className="text-muted-foreground">
                              Sales: {formatCurrency(tooltipData.sales)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  }}
                />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="acos"
                  name="ACOS (%)"
                  stroke={COLORS.acos}
                  strokeWidth={2}
                  dot={{ fill: COLORS.acos, strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="roas"
                  name="ROAS (x)"
                  stroke={COLORS.roas}
                  strokeWidth={2}
                  dot={{ fill: COLORS.roas, strokeWidth: 2 }}
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
