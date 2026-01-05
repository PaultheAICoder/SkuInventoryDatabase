'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SkuMappingTable } from '@/components/features/SkuMappingTable'
import { SkuMappingForm } from '@/components/features/SkuMappingForm'
import { MappingImportModal } from '@/components/features/MappingImportModal'
import { Link2, Search, Upload, Download } from 'lucide-react'
import { toast } from 'sonner'
import { channelTypes, CHANNEL_TYPE_DISPLAY_NAMES } from '@/types/channel-mapping'
import type { MappingResponse } from '@/types/channel-mapping'

export default function ChannelMappingsPage() {
  const [mappings, setMappings] = useState<MappingResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState<string>('')
  const [activeFilter, setActiveFilter] = useState<string>('')

  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingMapping, setEditingMapping] = useState<MappingResponse | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)

  const fetchMappings = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (channelFilter) params.set('channelType', channelFilter)
      if (activeFilter) params.set('isActive', activeFilter)

      const res = await fetch(`/api/shopify/mappings?${params.toString()}`)
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('You do not have permission to view channel mappings')
        }
        throw new Error('Failed to load channel mappings')
      }
      const data = await res.json().catch(() => ({}))
      setMappings(data?.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [search, channelFilter, activeFilter])

  useEffect(() => {
    fetchMappings()
  }, [fetchMappings])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchMappings()
  }

  const handleEdit = (mapping: MappingResponse) => {
    setEditingMapping(mapping)
  }

  const handleFormSuccess = () => {
    fetchMappings()
    setShowAddDialog(false)
    setEditingMapping(null)
    toast.success(editingMapping ? 'Mapping updated successfully' : 'Mapping created successfully')
  }

  const handleDownloadTemplate = async () => {
    try {
      const res = await fetch('/api/shopify/mappings/import')
      if (!res.ok) {
        throw new Error('Failed to download template')
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'channel-mapping-template.csv'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to download template')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">SKU Channel Mappings</h1>
          <p className="text-muted-foreground">
            Map external channel IDs (Shopify, Amazon, TikTok) to internal SKUs
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDownloadTemplate}>
            <Download className="mr-2 h-4 w-4" />
            Template
          </Button>
          <Button variant="outline" onClick={() => setShowImportModal(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import CSV
          </Button>
          <Button onClick={() => setShowAddDialog(true)}>
            <Link2 className="mr-2 h-4 w-4" />
            Add Mapping
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by ID or SKU..."
              className="pl-8 w-[250px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>

        <Select
          value={channelFilter || 'all'}
          onValueChange={(v) => setChannelFilter(v === 'all' ? '' : v)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Channels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Channels</SelectItem>
            {channelTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {CHANNEL_TYPE_DISPLAY_NAMES[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={activeFilter || 'all'}
          onValueChange={(v) => setActiveFilter(v === 'all' ? '' : v)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-md bg-destructive/10 p-4 text-destructive">{error}</div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="py-10 text-center text-muted-foreground">Loading channel mappings...</div>
      )}

      {/* Mapping Table */}
      {!isLoading && !error && (
        <SkuMappingTable
          mappings={mappings}
          onRefresh={fetchMappings}
          onEdit={handleEdit}
        />
      )}

      {/* Add/Edit Form Dialog */}
      <SkuMappingForm
        mapping={editingMapping}
        open={showAddDialog || !!editingMapping}
        onOpenChange={(open) => {
          if (!open) {
            setShowAddDialog(false)
            setEditingMapping(null)
          }
        }}
        onSuccess={handleFormSuccess}
      />

      {/* Import Modal */}
      <MappingImportModal
        open={showImportModal}
        onOpenChange={setShowImportModal}
        onSuccess={() => {
          fetchMappings()
          toast.success('Mappings imported successfully')
        }}
      />
    </div>
  )
}
