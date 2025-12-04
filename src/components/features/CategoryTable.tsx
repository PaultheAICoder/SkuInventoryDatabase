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
import { MoreHorizontal, Edit, Trash2, Power, PowerOff } from 'lucide-react'
import type { CategoryResponse } from '@/types/category'

interface CategoryTableProps {
  categories: CategoryResponse[]
  onRefresh: () => void
}

export function CategoryTable({ categories, onRefresh }: CategoryTableProps) {
  const [categoryToDelete, setCategoryToDelete] = useState<CategoryResponse | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const handleToggleActive = async (category: CategoryResponse) => {
    setActionError(null)
    try {
      const res = await fetch(`/api/categories/${category.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !category.isActive }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to toggle category status')
      }

      onRefresh()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to toggle category status')
    }
  }

  const handleDelete = async () => {
    if (!categoryToDelete) return

    setIsDeleting(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/categories/${categoryToDelete.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to delete category')
      }

      onRefresh()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to delete category')
    } finally {
      setIsDeleting(false)
      setCategoryToDelete(null)
    }
  }

  if (categories.length === 0) {
    return (
      <div className="py-10 text-center text-muted-foreground">
        No categories found.
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
              <TableHead>Status</TableHead>
              <TableHead>Components</TableHead>
              <TableHead className="w-[70px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((category) => (
              <TableRow key={category.id}>
                <TableCell className="font-medium">
                  {category.name}
                </TableCell>
                <TableCell>
                  <Badge variant={category.isActive ? 'success' : 'secondary'}>
                    {category.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell>{category.componentCount}</TableCell>
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
                        <Link href={`/settings/categories/${category.id}/edit`}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleToggleActive(category)}>
                        {category.isActive ? (
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
                        onClick={() => setCategoryToDelete(category)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!categoryToDelete} onOpenChange={() => setCategoryToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{categoryToDelete?.name}</strong>?
              {categoryToDelete && categoryToDelete.componentCount > 0 ? (
                <span className="block mt-2 text-destructive">
                  This category has {categoryToDelete.componentCount} component(s).
                  You must remove or reassign them before deleting.
                </span>
              ) : (
                <span className="block mt-2">
                  This will deactivate the category and it will no longer be available for new items.
                </span>
              )}
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
