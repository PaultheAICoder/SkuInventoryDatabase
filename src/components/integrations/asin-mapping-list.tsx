'use client'

/**
 * ASIN Mapping List Component
 *
 * Displays mapped and unmapped ASINs with suggested SKU matches.
 */

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2, Link2, Unlink, Search, ChevronDown, ChevronUp } from 'lucide-react'
import { AsinMappingModal } from './asin-mapping-modal'

interface Brand {
  id: string
  name: string
}

interface _SKU {
  id: string
  sku: string
  name: string
}

interface Mapping {
  id: string
  asin: string
  productName: string | null
  brand: { id: string; name: string }
  sku: { id: string; internalCode: string; name: string }
  createdBy: { id: string; name: string | null }
  createdAt: string
}

interface UnmappedAsin {
  asin: string
  productName: string | null
  brandId: string
  brandName: string
  suggestions: Array<{ id: string; sku: string; name: string; similarity: number }>
}

interface AsinMappingListProps {
  brands: Brand[]
  isAdmin?: boolean
}

export function AsinMappingList({ brands, isAdmin = false }: AsinMappingListProps) {
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [unmapped, setUnmapped] = useState<UnmappedAsin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedBrand, setSelectedBrand] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [showUnmapped, setShowUnmapped] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedUnmapped, setSelectedUnmapped] = useState<UnmappedAsin | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchMappings = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (selectedBrand !== 'all') {
        params.set('brandId', selectedBrand)
      }
      params.set('includeUnmapped', 'true')

      const response = await fetch(`/api/asin-mapping?${params}`)
      if (!response.ok) {
        throw new Error('Failed to fetch mappings')
      }

      const data = await response.json()
      setMappings(data.mappings || [])
      setUnmapped(data.unmapped || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load mappings')
    } finally {
      setLoading(false)
    }
  }, [selectedBrand])

  useEffect(() => {
    fetchMappings()
  }, [fetchMappings])

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this ASIN mapping?')) {
      return
    }

    setDeleting(id)
    try {
      const response = await fetch(`/api/asin-mapping/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete mapping')
      }

      await fetchMappings()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete mapping')
    } finally {
      setDeleting(null)
    }
  }

  const handleMapClick = (unmappedAsin: UnmappedAsin) => {
    setSelectedUnmapped(unmappedAsin)
    setModalOpen(true)
  }

  const handleMappingCreated = () => {
    setModalOpen(false)
    setSelectedUnmapped(null)
    fetchMappings()
  }

  // Filter mappings by search term
  const filteredMappings = mappings.filter(m =>
    m.asin.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.sku.internalCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
  )

  const filteredUnmapped = unmapped.filter(u =>
    u.asin.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            ASIN Mappings
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                ASIN Mappings
              </CardTitle>
              <CardDescription>
                Map Amazon ASINs to your internal SKU codes for sales attribution.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by ASIN or SKU..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={selectedBrand} onValueChange={setSelectedBrand}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by brand" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                {brands.map(brand => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Unmapped ASINs Section */}
          {filteredUnmapped.length > 0 && (
            <div className="space-y-2">
              <Button
                variant="ghost"
                className="w-full justify-between"
                onClick={() => setShowUnmapped(!showUnmapped)}
              >
                <span className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-yellow-500 text-black">
                    {filteredUnmapped.length}
                  </Badge>
                  Unmapped ASINs
                </span>
                {showUnmapped ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>

              {showUnmapped && (
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ASIN</TableHead>
                        <TableHead>Brand</TableHead>
                        <TableHead>Suggested SKUs</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUnmapped.map(u => (
                        <TableRow key={`${u.brandId}-${u.asin}`}>
                          <TableCell className="font-mono">{u.asin}</TableCell>
                          <TableCell>{u.brandName}</TableCell>
                          <TableCell>
                            {u.suggestions.length > 0 ? (
                              <span className="text-sm text-muted-foreground">
                                {u.suggestions.slice(0, 2).map(s => s.sku).join(', ')}
                                {u.suggestions.length > 2 && ` +${u.suggestions.length - 2} more`}
                              </span>
                            ) : (
                              <span className="text-sm text-muted-foreground">No suggestions</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              onClick={() => handleMapClick(u)}
                            >
                              <Link2 className="mr-2 h-4 w-4" />
                              Map
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          {/* Existing Mappings */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Badge variant="default" className="bg-green-600">
                {filteredMappings.length}
              </Badge>
              Mapped ASINs
            </h3>

            {filteredMappings.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                No ASIN mappings found.
              </div>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ASIN</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Created</TableHead>
                      {isAdmin && <TableHead className="text-right">Action</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMappings.map(m => (
                      <TableRow key={m.id}>
                        <TableCell className="font-mono">{m.asin}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{m.sku.internalCode}</div>
                            <div className="text-sm text-muted-foreground">{m.sku.name}</div>
                          </div>
                        </TableCell>
                        <TableCell>{m.brand.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(m.createdAt).toLocaleDateString()}
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(m.id)}
                              disabled={deleting === m.id}
                            >
                              {deleting === m.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Unlink className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Mapping Modal */}
      <AsinMappingModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        unmappedAsin={selectedUnmapped}
        brands={brands}
        onSuccess={handleMappingCreated}
      />
    </>
  )
}
