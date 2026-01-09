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
import { MoreHorizontal, Edit, Power, PowerOff } from 'lucide-react'
import type { VendorResponse } from '@/types/vendor'

interface VendorTableProps {
  vendors: VendorResponse[]
  onRefresh: () => void
}

export function VendorTable({ vendors, onRefresh }: VendorTableProps) {
  const [actionError, setActionError] = useState<string | null>(null)

  const handleToggleActive = async (vendor: VendorResponse) => {
    setActionError(null)
    try {
      const res = await fetch(`/api/vendors/${vendor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !vendor.isActive }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to toggle vendor status')
      }

      onRefresh()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to toggle vendor status')
    }
  }

  if (vendors.length === 0) {
    return (
      <div className="py-10 text-center text-muted-foreground">
        No vendors found.
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
              <TableHead>Contact Email</TableHead>
              <TableHead>Contact Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[70px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendors.map((vendor) => (
              <TableRow key={vendor.id}>
                <TableCell className="font-medium">
                  {vendor.name}
                </TableCell>
                <TableCell>
                  {vendor.contactEmail || '-'}
                </TableCell>
                <TableCell>
                  {vendor.contactPhone || '-'}
                </TableCell>
                <TableCell>
                  <Badge variant={vendor.isActive ? 'success' : 'secondary'}>
                    {vendor.isActive ? 'Active' : 'Inactive'}
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
                      <DropdownMenuItem asChild>
                        <Link href={`/settings/vendors/${vendor.id}/edit`}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleToggleActive(vendor)}>
                        {vendor.isActive ? (
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
