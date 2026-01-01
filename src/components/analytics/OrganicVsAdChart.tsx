'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Loader2 } from 'lucide-react'
import type { OrganicAdBreakdown } from '@/types/amazon-analytics'

interface OrganicVsAdChartProps {
  data: OrganicAdBreakdown
  isLoading?: boolean
}

// Color scheme
const COLORS = ['#22c55e', '#f97316'] // green-500 (organic), orange-500 (ad)

// Format currency for display
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function OrganicVsAdChart({ data, isLoading }: OrganicVsAdChartProps) {
  // Transform data for pie chart
  const pieData = [
    { name: 'Organic', value: data.organic },
    { name: 'Ad-Attributed', value: data.adAttributed },
  ]

  const hasData = data.organic > 0 || data.adAttributed > 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organic vs Ad-Attributed Sales</CardTitle>
        <CardDescription>
          Breakdown of sales by attribution source
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-80 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !hasData ? (
          <div className="flex h-80 items-center justify-center text-muted-foreground">
            No attribution data available
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                  label={({ percent }) => `${((percent ?? 0) * 100).toFixed(1)}%`}
                  labelLine={false}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const item = payload[0]
                    const value = item.value as number
                    const name = item.name as string
                    const percentage = name === 'Organic'
                      ? data.organicPercentage
                      : data.adPercentage
                    return (
                      <div className="rounded-lg border bg-background p-3 shadow-lg">
                        <p className="font-medium">{name}</p>
                        <div className="mt-2 space-y-1 text-sm">
                          <p>{formatCurrency(value)}</p>
                          <p className="text-muted-foreground">
                            {percentage.toFixed(1)}% of total
                          </p>
                        </div>
                      </div>
                    )
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value, entry) => {
                    const { payload } = entry
                    const amount = payload?.value as number
                    return (
                      <span className="text-sm">
                        {value}: {formatCurrency(amount)}
                      </span>
                    )
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
