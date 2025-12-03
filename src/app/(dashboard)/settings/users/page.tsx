'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { UserTable } from '@/components/features/UserTable'
import { UserPlus, Search } from 'lucide-react'
import type { UserResponse } from '@/types/user'

export default function UsersPage() {
  const { data: session } = useSession()
  const [users, setUsers] = useState<UserResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('')
  const [activeFilter, setActiveFilter] = useState<string>('')

  const fetchUsers = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (roleFilter) params.set('role', roleFilter)
      if (activeFilter) params.set('isActive', activeFilter)

      const res = await fetch(`/api/users?${params.toString()}`)
      if (!res.ok) {
        throw new Error('Failed to load users')
      }
      const data = await res.json().catch(() => ({}))
      setUsers(data?.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [search, roleFilter, activeFilter])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchUsers()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground">Manage users and their permissions</p>
        </div>
        <Button asChild>
          <Link href="/settings/users/new">
            <UserPlus className="mr-2 h-4 w-4" />
            Add User
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search users..."
              className="pl-8 w-[250px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>

        <Select value={roleFilter || 'all'} onValueChange={(v) => setRoleFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="ops">Operations</SelectItem>
            <SelectItem value="viewer">Viewer</SelectItem>
          </SelectContent>
        </Select>

        <Select value={activeFilter || 'all'} onValueChange={(v) => setActiveFilter(v === 'all' ? '' : v)}>
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
        <div className="py-10 text-center text-muted-foreground">Loading users...</div>
      )}

      {/* User Table */}
      {!isLoading && !error && session?.user && (
        <UserTable users={users} currentUserId={session.user.id} onRefresh={fetchUsers} />
      )}
    </div>
  )
}
