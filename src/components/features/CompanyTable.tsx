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
import { MoreHorizontal, Edit, Trash2 } from 'lucide-react'
import type { CompanyResponse } from '@/types/company'

interface CompanyTableProps {
  companies: CompanyResponse[]
  currentCompanyId: string
  onRefresh: () => void
}

export function CompanyTable({ companies, currentCompanyId, onRefresh }: CompanyTableProps) {
  const [companyToDelete, setCompanyToDelete] = useState<CompanyResponse | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const handleDelete = async () => {
    if (!companyToDelete) return

    setIsDeleting(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/companies/${companyToDelete.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to delete company')
      }

      onRefresh()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to delete company')
    } finally {
      setIsDeleting(false)
      setCompanyToDelete(null)
    }
  }

  const canDelete = (company: CompanyResponse) => {
    return company.userCount === 0 && company.brandCount === 0 && company.id !== currentCompanyId
  }

  if (companies.length === 0) {
    return (
      <div className="py-10 text-center text-muted-foreground">
        No companies found.
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
              <TableHead>Users</TableHead>
              <TableHead>Brands</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[70px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.map((company) => (
              <TableRow key={company.id}>
                <TableCell className="font-medium">
                  {company.name}
                  {company.id === currentCompanyId && (
                    <Badge variant="secondary" className="ml-2">Current</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{company.userCount}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{company.brandCount}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground" suppressHydrationWarning>
                  {new Date(company.createdAt).toLocaleDateString()}
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
                        <Link href={`/settings/companies/${company.id}/edit`}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </Link>
                      </DropdownMenuItem>
                      {canDelete(company) ? (
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setCompanyToDelete(company)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem disabled className="text-muted-foreground">
                          <Trash2 className="mr-2 h-4 w-4" />
                          {company.id === currentCompanyId
                            ? 'Cannot delete current'
                            : 'Has associated data'}
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

      <AlertDialog open={!!companyToDelete} onOpenChange={() => setCompanyToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Company</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{companyToDelete?.name}</strong>? This action
              cannot be undone.
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
