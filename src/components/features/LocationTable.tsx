'use client'

import { useState } from 'react'
import Link from 'next/link'
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
import { MoreHorizontal, Edit, Star, Power, PowerOff } from 'lucide-react'
import { LOCATION_TYPE_DISPLAY_NAMES } from '@/types/location'
import type { LocationResponse } from '@/types/location'

interface LocationTableProps {
  locations: LocationResponse[]
  onRefresh: () => void
}

export function LocationTable({ locations, onRefresh }: LocationTableProps) {
  const [actionError, setActionError] = useState<string | null>(null)

  const handleSetDefault = async (location: LocationResponse) => {
    setActionError(null)
    try {
      const res = await fetch(`/api/locations/${location.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to set default location')
      }

      onRefresh()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to set default location')
    }
  }

  const handleToggleActive = async (location: LocationResponse) => {
    setActionError(null)
    try {
      const res = await fetch(`/api/locations/${location.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !location.isActive }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to toggle location status')
      }

      onRefresh()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to toggle location status')
    }
  }

  const getTypeBadgeVariant = (type: string) => {
    switch (type) {
      case 'warehouse':
        return 'default'
      case 'threepl':
        return 'secondary'
      case 'fba':
        return 'outline'
      case 'finished_goods':
        return 'default'
      default:
        return 'outline'
    }
  }

  if (locations.length === 0) {
    return (
      <div className="py-10 text-center text-muted-foreground">
        No locations found.
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
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Default</TableHead>
              <TableHead className="w-[70px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {locations.map((location) => (
              <TableRow key={location.id}>
                <TableCell className="font-medium">
                  {location.name}
                </TableCell>
                <TableCell>
                  <Badge variant={getTypeBadgeVariant(location.type)}>
                    {LOCATION_TYPE_DISPLAY_NAMES[location.type]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={location.isActive ? 'success' : 'secondary'}>
                    {location.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell>
                  {location.isDefault && (
                    <Badge variant="default">
                      <Star className="mr-1 h-3 w-3" />
                      Default
                    </Badge>
                  )}
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
                      <DropdownMenuItem asChild>
                        <Link href={`/settings/locations/${location.id}/edit`}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </Link>
                      </DropdownMenuItem>
                      {!location.isDefault && (
                        <>
                          <DropdownMenuItem onClick={() => handleSetDefault(location)}>
                            <Star className="mr-2 h-4 w-4" />
                            Set as Default
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleActive(location)}>
                            {location.isActive ? (
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
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
