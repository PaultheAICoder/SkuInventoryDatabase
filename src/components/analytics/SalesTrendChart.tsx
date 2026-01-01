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
import type { SalesTrendDataPoint } from '@/types/amazon-analytics'

interface SalesTrendChartProps {
  data: SalesTrendDataPoint[]
  isLoading?: boolean
}

// Color scheme
const COLORS = {
  total: '#3b82f6', // blue-500
  organic: '#22c55e', // green-500
  adAttributed: '#f97316', // orange-500
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

export function SalesTrendChart({ data, isLoading }: SalesTrendChartProps) {
  // Transform data to include formatted dates
  const chartData = data.map((d) => ({
    ...d,
    formattedDate: formatDateString(d.date, { month: 'short', day: 'numeric' }),
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sales Trend</CardTitle>
        <CardDescription>
          Total, organic, and ad-attributed sales over time
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-80 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-80 items-center justify-center text-muted-foreground">
            No sales data available
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
                  tickFormatter={(value) => formatCurrency(value)}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const tooltipData = payload[0].payload as SalesTrendDataPoint & { formattedDate: string }
                    return (
                      <div className="rounded-lg border bg-background p-3 shadow-lg">
                        <p className="font-medium">{label}</p>
                        <div className="mt-2 space-y-1 text-sm">
                          <p>
                            <span style={{ color: COLORS.total }}>Total:</span>{' '}
                            {formatCurrency(tooltipData.totalSales)}
                          </p>
                          <p>
                            <span style={{ color: COLORS.organic }}>Organic:</span>{' '}
                            {formatCurrency(tooltipData.organicSales)}
                          </p>
                          <p>
                            <span style={{ color: COLORS.adAttributed }}>Ad-Attributed:</span>{' '}
                            {formatCurrency(tooltipData.adAttributedSales)}
                          </p>
                        </div>
                      </div>
                    )
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="totalSales"
                  name="Total Sales"
                  stroke={COLORS.total}
                  strokeWidth={2}
                  dot={{ fill: COLORS.total, strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="organicSales"
                  name="Organic Sales"
                  stroke={COLORS.organic}
                  strokeWidth={2}
                  dot={{ fill: COLORS.organic, strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="adAttributedSales"
                  name="Ad-Attributed Sales"
                  stroke={COLORS.adAttributed}
                  strokeWidth={2}
                  dot={{ fill: COLORS.adAttributed, strokeWidth: 2 }}
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
