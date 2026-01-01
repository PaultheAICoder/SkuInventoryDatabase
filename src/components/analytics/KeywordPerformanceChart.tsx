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
import { Loader2 } from 'lucide-react'
import type { KeywordPerformanceData } from '@/types/amazon-analytics'

interface KeywordPerformanceChartProps {
  data: KeywordPerformanceData[]
  isLoading?: boolean
}

// Color scheme
const COLORS = {
  spend: '#ef4444', // red-500
  sales: '#22c55e', // green-500
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

// Truncate keyword for axis label
function truncateKeyword(keyword: string, maxLength: number = 20): string {
  if (keyword.length <= maxLength) return keyword
  return keyword.slice(0, maxLength) + '...'
}

export function KeywordPerformanceChart({ data, isLoading }: KeywordPerformanceChartProps) {
  // Transform data with truncated keywords for display
  const chartData = data.slice(0, 10).map((kw) => ({
    ...kw,
    shortKeyword: truncateKeyword(kw.keyword),
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Keywords by Spend</CardTitle>
        <CardDescription>
          Top 10 keywords comparing ad spend vs sales generated
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-96 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-96 items-center justify-center text-muted-foreground">
            No keyword data available
          </div>
        ) : (
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={chartData}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  type="number"
                  tickFormatter={(value) => formatCurrency(value)}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="shortKeyword"
                  width={150}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const tooltipData = payload[0].payload as KeywordPerformanceData
                    return (
                      <div className="rounded-lg border bg-background p-3 shadow-lg max-w-xs">
                        <p className="font-medium break-words">{tooltipData.keyword}</p>
                        <div className="mt-2 space-y-1 text-sm">
                          <p>
                            <span style={{ color: COLORS.spend }}>Spend:</span>{' '}
                            {formatCurrency(tooltipData.spend)}
                          </p>
                          <p>
                            <span style={{ color: COLORS.sales }}>Sales:</span>{' '}
                            {formatCurrency(tooltipData.sales)}
                          </p>
                          <div className="mt-2 border-t pt-2 text-muted-foreground">
                            <p>ACOS: {tooltipData.acos.toFixed(1)}%</p>
                            <p>ROAS: {tooltipData.roas.toFixed(2)}x</p>
                            <p>Orders: {tooltipData.orders.toLocaleString()}</p>
                            <p>Impressions: {tooltipData.impressions.toLocaleString()}</p>
                            <p>Clicks: {tooltipData.clicks.toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                    )
                  }}
                />
                <Legend />
                <Bar
                  dataKey="spend"
                  name="Spend"
                  fill={COLORS.spend}
                  radius={[0, 4, 4, 0]}
                />
                <Bar
                  dataKey="sales"
                  name="Sales"
                  fill={COLORS.sales}
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
