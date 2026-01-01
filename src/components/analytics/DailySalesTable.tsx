'use client'

import { useState, useMemo } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowUpDown, ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react'
import type { DailySalesTableData } from '@/types/amazon-analytics'
import { toCSV, type CSVColumn } from '@/services/export'
import { formatDateString } from '@/lib/utils'

interface DailySalesTableProps {
  data: DailySalesTableData[]
  isLoading?: boolean
}

type SortColumn = 'date' | 'totalSales' | 'adAttributedSales' | 'organicSales' | 'organicPercentage'
type SortDirection = 'asc' | 'desc'

// Export column definitions
const dailySalesExportColumns: CSVColumn<DailySalesTableData>[] = [
  { header: 'Date', accessor: (d) => d.date },
  { header: 'Total Sales', accessor: (d) => d.totalSales.toFixed(2) },
  { header: 'Ad Sales', accessor: (d) => d.adAttributedSales.toFixed(2) },
  { header: 'Organic Sales', accessor: (d) => d.organicSales.toFixed(2) },
  { header: 'Organic %', accessor: (d) => d.organicPercentage.toFixed(2) },
  { header: 'Orders', accessor: (d) => d.orderCount },
]

// Format currency
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

// Get organic percentage color class (gradient from red to green)
function getOrganicColorClass(percentage: number): string {
  if (percentage >= 70) return 'text-green-600'
  if (percentage >= 50) return 'text-green-500'
  if (percentage >= 30) return 'text-yellow-600'
  return 'text-red-500'
}

// Download CSV helper
function downloadCSV(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}

export function DailySalesTable({ data, isLoading = false }: DailySalesTableProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>('date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [page, setPage] = useState(1)
  const pageSize = 30

  // Sort data
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      let comparison = 0
      switch (sortColumn) {
        case 'date':
          comparison = a.date.localeCompare(b.date)
          break
        case 'totalSales':
          comparison = a.totalSales - b.totalSales
          break
        case 'adAttributedSales':
          comparison = a.adAttributedSales - b.adAttributedSales
          break
        case 'organicSales':
          comparison = a.organicSales - b.organicSales
          break
        case 'organicPercentage':
          comparison = a.organicPercentage - b.organicPercentage
          break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [data, sortColumn, sortDirection])

  // Paginate sorted data
  const paginatedData = useMemo(() => {
    const start = (page - 1) * pageSize
    return sortedData.slice(start, start + pageSize)
  }, [sortedData, page, pageSize])

  const totalPages = Math.ceil(sortedData.length / pageSize)

  // Calculate totals
  const totals = useMemo(() => {
    return data.reduce(
      (acc, row) => ({
        totalSales: acc.totalSales + row.totalSales,
        adAttributedSales: acc.adAttributedSales + row.adAttributedSales,
        organicSales: acc.organicSales + row.organicSales,
        orderCount: acc.orderCount + row.orderCount,
      }),
      { totalSales: 0, adAttributedSales: 0, organicSales: 0, orderCount: 0 }
    )
  }, [data])

  const overallOrganicPercentage = totals.totalSales > 0
    ? (totals.organicSales / totals.totalSales) * 100
    : 0

  // Handle sort
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection(column === 'date' ? 'desc' : 'desc')
    }
    setPage(1)
  }

  // Handle export
  const handleExport = () => {
    const csv = toCSV(sortedData, dailySalesExportColumns)
    const date = new Date().toISOString().split('T')[0]
    downloadCSV(csv, `daily-sales-${date}.csv`)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle>Daily Sales Breakdown</CardTitle>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={sortedData.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3"
                        onClick={() => handleSort('date')}
                      >
                        Date
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-mr-3"
                        onClick={() => handleSort('totalSales')}
                      >
                        Total Sales
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-mr-3"
                        onClick={() => handleSort('adAttributedSales')}
                      >
                        Ad Sales
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-mr-3"
                        onClick={() => handleSort('organicSales')}
                      >
                        Organic Sales
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-mr-3"
                        onClick={() => handleSort('organicPercentage')}
                      >
                        Organic %
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        No daily sales data available.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedData.map((row) => (
                      <TableRow key={row.date}>
                        <TableCell className="font-medium">
                          {formatDateString(row.date, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(row.totalSales)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(row.adAttributedSales)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(row.organicSales)}
                        </TableCell>
                        <TableCell className={`text-right font-mono ${getOrganicColorClass(row.organicPercentage)}`}>
                          {row.organicPercentage.toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right font-mono" suppressHydrationWarning>
                          {row.orderCount.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                {data.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-semibold">Total</TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {formatCurrency(totals.totalSales)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {formatCurrency(totals.adAttributedSales)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {formatCurrency(totals.organicSales)}
                      </TableCell>
                      <TableCell className={`text-right font-mono font-semibold ${getOrganicColorClass(overallOrganicPercentage)}`}>
                        {overallOrganicPercentage.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold" suppressHydrationWarning>
                        {totals.orderCount.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, sortedData.length)} of{' '}
                  {sortedData.length} days
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page - 1)}
                    disabled={page <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={page >= totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
