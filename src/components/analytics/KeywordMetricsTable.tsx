'use client'

import { useState, useMemo } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowUpDown, Search, ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react'
import type { KeywordPerformanceData } from '@/types/amazon-analytics'
import { toCSV, type CSVColumn } from '@/services/export'

interface KeywordMetricsTableProps {
  data: KeywordPerformanceData[]
  isLoading?: boolean
}

type SortColumn = 'keyword' | 'impressions' | 'clicks' | 'spend' | 'sales' | 'acos' | 'roas'
type SortDirection = 'asc' | 'desc'

// Export column definitions
const keywordExportColumns: CSVColumn<KeywordPerformanceData>[] = [
  { header: 'Keyword', accessor: (k) => k.keyword },
  { header: 'Match Type', accessor: (k) => k.matchType || 'N/A' },
  { header: 'Impressions', accessor: (k) => k.impressions },
  { header: 'Clicks', accessor: (k) => k.clicks },
  { header: 'CTR %', accessor: (k) => (k.ctr ?? 0).toFixed(2) },
  { header: 'Spend', accessor: (k) => k.spend.toFixed(2) },
  { header: 'Sales', accessor: (k) => k.sales.toFixed(2) },
  { header: 'Orders', accessor: (k) => k.orders },
  { header: 'ACOS %', accessor: (k) => k.acos.toFixed(2) },
  { header: 'ROAS', accessor: (k) => k.roas.toFixed(2) },
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

// Get ACOS color class
function getAcosColorClass(acos: number): string {
  if (acos < 20) return 'text-green-600'
  if (acos <= 30) return 'text-yellow-600'
  return 'text-red-600'
}

// Get ROAS color class
function getRoasColorClass(roas: number): string {
  if (roas >= 3) return 'text-green-600'
  if (roas >= 1) return 'text-yellow-600'
  return 'text-red-600'
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

export function KeywordMetricsTable({ data, isLoading = false }: KeywordMetricsTableProps) {
  const [search, setSearch] = useState('')
  const [sortColumn, setSortColumn] = useState<SortColumn>('spend')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [page, setPage] = useState(1)
  const pageSize = 25

  // Filter data by search term
  const filteredData = useMemo(() => {
    if (!search.trim()) return data
    const searchLower = search.toLowerCase()
    return data.filter((k) => k.keyword.toLowerCase().includes(searchLower))
  }, [data, search])

  // Sort filtered data
  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      let comparison = 0
      switch (sortColumn) {
        case 'keyword':
          comparison = a.keyword.localeCompare(b.keyword)
          break
        case 'impressions':
          comparison = a.impressions - b.impressions
          break
        case 'clicks':
          comparison = a.clicks - b.clicks
          break
        case 'spend':
          comparison = a.spend - b.spend
          break
        case 'sales':
          comparison = a.sales - b.sales
          break
        case 'acos':
          comparison = a.acos - b.acos
          break
        case 'roas':
          comparison = a.roas - b.roas
          break
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [filteredData, sortColumn, sortDirection])

  // Paginate sorted data
  const paginatedData = useMemo(() => {
    const start = (page - 1) * pageSize
    return sortedData.slice(start, start + pageSize)
  }, [sortedData, page, pageSize])

  const totalPages = Math.ceil(sortedData.length / pageSize)

  // Handle sort
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('desc')
    }
    setPage(1) // Reset to first page on sort
  }

  // Handle search
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1) // Reset to first page on search
  }

  // Handle export
  const handleExport = () => {
    const csv = toCSV(sortedData, keywordExportColumns)
    const date = new Date().toISOString().split('T')[0]
    downloadCSV(csv, `keyword-metrics-${date}.csv`)
  }

  // Calculate CTR from clicks/impressions if not provided
  const getCtr = (row: KeywordPerformanceData): number => {
    if (row.ctr !== undefined) return row.ctr
    if (row.impressions === 0) return 0
    return (row.clicks / row.impressions) * 100
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle>Keyword Performance</CardTitle>
        <div className="flex items-center gap-2">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search keywords..."
                className="pl-8 w-[200px]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </form>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={sortedData.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
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
                        onClick={() => handleSort('keyword')}
                      >
                        Keyword
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>Match Type</TableHead>
                    <TableHead className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-mr-3"
                        onClick={() => handleSort('impressions')}
                      >
                        Impressions
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-mr-3"
                        onClick={() => handleSort('clicks')}
                      >
                        Clicks
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-mr-3"
                        onClick={() => handleSort('spend')}
                      >
                        Spend
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-mr-3"
                        onClick={() => handleSort('sales')}
                      >
                        Sales
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-mr-3"
                        onClick={() => handleSort('acos')}
                      >
                        ACOS
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-mr-3"
                        onClick={() => handleSort('roas')}
                      >
                        ROAS
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                        {search ? 'No keywords match your search.' : 'No keyword data available.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedData.map((row, index) => (
                      <TableRow key={`${row.keyword}-${index}`}>
                        <TableCell className="font-medium max-w-[200px] truncate" title={row.keyword}>
                          {row.keyword}
                        </TableCell>
                        <TableCell>
                          {row.matchType ? (
                            <Badge variant="secondary" className="capitalize">
                              {row.matchType}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono" suppressHydrationWarning>
                          {row.impressions.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono" suppressHydrationWarning>
                          {row.clicks.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {getCtr(row).toFixed(2)}%
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(row.spend)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(row.sales)}
                        </TableCell>
                        <TableCell className="text-right font-mono" suppressHydrationWarning>
                          {row.orders.toLocaleString()}
                        </TableCell>
                        <TableCell className={`text-right font-mono ${getAcosColorClass(row.acos)}`}>
                          {row.acos.toFixed(2)}%
                        </TableCell>
                        <TableCell className={`text-right font-mono ${getRoasColorClass(row.roas)}`}>
                          {row.roas.toFixed(2)}x
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, sortedData.length)} of{' '}
                  {sortedData.length} keywords
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
