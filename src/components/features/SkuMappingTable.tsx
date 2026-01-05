'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { MoreHorizontal, Edit, Trash2, Power, PowerOff, Info } from 'lucide-react'
import { CHANNEL_TYPE_DISPLAY_NAMES, type ChannelType } from '@/types/channel-mapping'
import type { MappingResponse } from '@/types/channel-mapping'

interface SkuMappingTableProps {
  mappings: MappingResponse[]
  onRefresh: () => void
  onEdit: (mapping: MappingResponse) => void
}

export function SkuMappingTable({ mappings, onRefresh, onEdit }: SkuMappingTableProps) {
  const [mappingToDelete, setMappingToDelete] = useState<MappingResponse | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const handleToggleActive = async (mapping: MappingResponse) => {
    setActionError(null)
    try {
      const res = await fetch(`/api/shopify/mappings/${mapping.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !mapping.isActive }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to toggle mapping status')
      }

      onRefresh()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to toggle mapping status')
    }
  }

  const handleDelete = async () => {
    if (!mappingToDelete) return

    setIsDeleting(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/shopify/mappings/${mappingToDelete.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to delete mapping')
      }

      onRefresh()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to delete mapping')
    } finally {
      setIsDeleting(false)
      setMappingToDelete(null)
    }
  }

  const getChannelBadgeVariant = (channelType: string) => {
    switch (channelType) {
      case 'shopify':
        return 'default'
      case 'amazon':
        return 'secondary'
      case 'tiktok':
        return 'outline'
      default:
        return 'outline'
    }
  }

  if (mappings.length === 0) {
    return (
      <div className="py-10 text-center text-muted-foreground">
        No channel mappings found. Click &quot;Add Mapping&quot; to create one.
      </div>
    )
  }

  return (
    <>
      {actionError && (
        <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>External ID</TableHead>
              <TableHead>External SKU</TableHead>
              <TableHead>Internal SKU</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[70px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {mappings.map((mapping) => (
              <TableRow key={mapping.id}>
                <TableCell className="font-mono text-sm">
                  <div className="flex flex-col">
                    <span>{mapping.externalId}</span>
                    {mapping.source === 'asin' && mapping.brandName && (
                      <span className="text-xs text-muted-foreground">
                        Brand: {mapping.brandName}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {mapping.source === 'asin' && mapping.productName
                    ? mapping.productName
                    : mapping.externalSku || '-'}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{mapping.sku.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {mapping.sku.internalCode}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Badge variant={getChannelBadgeVariant(mapping.channelType)}>
                      {CHANNEL_TYPE_DISPLAY_NAMES[mapping.channelType as ChannelType] || mapping.channelType}
                    </Badge>
                    {mapping.source === 'asin' && (
                      <Badge variant="outline" className="text-xs">
                        ASIN
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={mapping.isActive ? 'success' : 'secondary'}>
                    {mapping.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Open menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {mapping.source !== 'asin' ? (
                        <>
                          <DropdownMenuItem onClick={() => onEdit(mapping)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleActive(mapping)}>
                            {mapping.isActive ? (
                              <>
                                <PowerOff className="mr-2 h-4 w-4" />
                                Deactivate
                              </>
                            ) : (
                              <>
                                <Power className="mr-2 h-4 w-4" />
                                Activate
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setMappingToDelete(mapping)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </>
                      ) : (
                        <DropdownMenuItem disabled className="text-muted-foreground">
                          <Info className="mr-2 h-4 w-4" />
                          Managed via Amazon integration
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!mappingToDelete} onOpenChange={() => setMappingToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Channel Mapping</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the mapping for external ID{' '}
              <strong>{mappingToDelete?.externalId}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
