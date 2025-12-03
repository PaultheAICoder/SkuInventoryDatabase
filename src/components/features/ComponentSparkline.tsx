'use client'

import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'

interface TrendDataPoint {
  date: string
  quantityOnHand: number
}

interface ComponentSparklineProps {
  data: TrendDataPoint[]
  height?: number
  isLoading?: boolean
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    payload: TrendDataPoint
  }>
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const data = payload[0].payload
  return (
    <div className="rounded-lg border bg-background p-2 shadow-lg">
      <p className="text-xs text-muted-foreground">
        {new Date(data.date).toLocaleDateString()}
      </p>
      <p className="text-sm font-medium">
        {data.quantityOnHand.toLocaleString()} units
      </p>
    </div>
  )
}

export function ComponentSparkline({
  data,
  height = 80,
  isLoading = false,
}: ComponentSparklineProps) {
  if (isLoading) {
    return (
      <div
        className="animate-pulse bg-muted rounded"
        style={{ height }}
      />
    )
  }

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        No trend data available
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
        <Line
          type="monotone"
          dataKey="quantityOnHand"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false}
        />
        <Tooltip content={<CustomTooltip />} />
      </LineChart>
    </ResponsiveContainer>
  )
}
