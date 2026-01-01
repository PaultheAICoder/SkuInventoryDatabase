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
import type { CampaignPerformanceData } from '@/types/amazon-analytics'
import { toCSV, type CSVColumn } from '@/services/export'

interface CampaignTableProps {
  data: CampaignPerformanceData[]
  isLoading?: boolean
}

type SortColumn = 'name' | 'spend' | 'sales' | 'acos' | 'roas'
type SortDirection = 'asc' | 'desc'

// Campaign type display configuration
const CAMPAIGN_TYPES: Record<string, { label: string; className: string }> = {
  sponsoredProducts: { label: 'SP', className: 'bg-blue-100 text-blue-800' },
  sponsoredBrands: { label: 'SB', className: 'bg-purple-100 text-purple-800' },
  sponsoredDisplay: { label: 'SD', className: 'bg-orange-100 text-orange-800' },
}

// Campaign state display configuration
const CAMPAIGN_STATES: Record<string, { variant: 'success' | 'warning' | 'secondary' }> = {
  enabled: { variant: 'success' },
  paused: { variant: 'warning' },
  archived: { variant: 'secondary' },
}

// Export column definitions
const campaignExportColumns: CSVColumn<CampaignPerformanceData>[] = [
  { header: 'Campaign Name', accessor: (c) => c.name },
  { header: 'Type', accessor: (c) => c.campaignType },
  { header: 'Status', accessor: (c) => c.state },
  { header: 'Daily Budget', accessor: (c) => (c.dailyBudget !== null ? c.dailyBudget.toFixed(2) : 'N/A') },
  { header: 'Spend', accessor: (c) => c.spend.toFixed(2) },
  { header: 'Sales', accessor: (c) => c.sales.toFixed(2) },
  { header: 'Impressions', accessor: (c) => c.impressions },
  { header: 'Clicks', accessor: (c) => c.clicks },
  { header: 'Orders', accessor: (c) => c.orders },
  { header: 'ACOS %', accessor: (c) => c.acos.toFixed(2) },
  { header: 'ROAS', accessor: (c) => c.roas.toFixed(2) },
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

export function CampaignTable({ data, isLoading = false }: CampaignTableProps) {
  const [search, setSearch] = useState('')
  const [sortColumn, setSortColumn] = useState<SortColumn>('spend')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [page, setPage] = useState(1)
  const pageSize = 10

  // Filter data by search term
  const filteredData = useMemo(() => {
    if (!search.trim()) return data
    const searchLower = search.toLowerCase()
    return data.filter((c) => c.name.toLowerCase().includes(searchLower))
  }, [data, search])

  // Sort filtered data
  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      let comparison = 0
      switch (sortColumn) {
        case 'name':
          comparison = a.name.localeCompare(b.name)
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
    setPage(1)
  }

  // Handle search
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
  }

  // Handle export
  const handleExport = () => {
    const csv = toCSV(sortedData, campaignExportColumns)
    const date = new Date().toISOString().split('T')[0]
    downloadCSV(csv, `campaign-metrics-${date}.csv`)
  }

  // Get campaign type badge
  const getCampaignTypeBadge = (type: string) => {
    const config = CAMPAIGN_TYPES[type] || { label: type.substring(0, 3).toUpperCase(), className: 'bg-gray-100 text-gray-800' }
    return (
      <Badge className={`${config.className} border-0`}>
        {config.label}
      </Badge>
    )
  }

  // Get state badge
  const getStateBadge = (state: string) => {
    const config = CAMPAIGN_STATES[state] || { variant: 'secondary' as const }
    return (
      <Badge variant={config.variant} className="capitalize">
        {state}
      </Badge>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle>Campaign Performance</CardTitle>
        <div className="flex items-center gap-2">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search campaigns..."
                className="pl-8 w-[180px]"
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
                        onClick={() => handleSort('name')}
                      >
                        Campaign
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Budget</TableHead>
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
                      <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                        {search ? 'No campaigns match your search.' : 'No campaign data available.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedData.map((row) => (
                      <TableRow key={row.campaignId}>
                        <TableCell className="font-medium max-w-[200px] truncate" title={row.name}>
                          {row.name}
                        </TableCell>
                        <TableCell>{getCampaignTypeBadge(row.campaignType)}</TableCell>
                        <TableCell>{getStateBadge(row.state)}</TableCell>
                        <TableCell className="text-right font-mono">
                          {row.dailyBudget !== null ? formatCurrency(row.dailyBudget) : 'N/A'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(row.spend)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(row.sales)}
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
                  {sortedData.length} campaigns
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
