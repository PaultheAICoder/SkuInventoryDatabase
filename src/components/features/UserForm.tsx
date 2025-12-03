'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ROLE_DISPLAY_NAMES, ROLE_DESCRIPTIONS } from '@/lib/permissions'
import type { UserResponse } from '@/types/user'

interface UserFormProps {
  user?: UserResponse
  onSuccess?: () => void
}

export function UserForm({ user, onSuccess }: UserFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    email: user?.email ?? '',
    password: '',
    name: user?.name ?? '',
    role: user?.role ?? 'ops',
    isActive: user?.isActive ?? true,
  })

  const isEditing = !!user

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const url = isEditing ? `/api/users/${user.id}` : '/api/users'
      const method = isEditing ? 'PATCH' : 'POST'

      // Build request body
      const body: Record<string, unknown> = {
        name: formData.name,
        role: formData.role,
      }

      if (!isEditing) {
        body.email = formData.email
        body.password = formData.password
      } else {
        if (formData.email !== user.email) {
          body.email = formData.email
        }
        if (formData.password) {
          body.password = formData.password
        }
        body.isActive = formData.isActive
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to save user')
      }

      if (onSuccess) {
        onSuccess()
      } else {
        router.push('/settings/users')
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? 'Edit User' : 'Create User'}</CardTitle>
          <CardDescription>
            {isEditing
              ? 'Update user information and permissions'
              : 'Add a new user to your organization'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="John Doe"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="john@example.com"
                value={formData.email}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                required
                disabled={isEditing}
              />
              {isEditing && (
                <p className="text-xs text-muted-foreground">Email cannot be changed</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">
                {isEditing ? 'New Password (leave blank to keep current)' : 'Password *'}
              </Label>
              <Input
                id="password"
                type="password"
                placeholder={isEditing ? '••••••••' : 'Minimum 8 characters'}
                value={formData.password}
                onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                required={!isEditing}
                minLength={8}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role *</Label>
              <Select
                value={formData.role}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, role: value as 'admin' | 'ops' | 'viewer' }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['admin', 'ops', 'viewer'] as const).map((role) => (
                    <SelectItem key={role} value={role}>
                      <div>
                        <span className="font-medium">{ROLE_DISPLAY_NAMES[role]}</span>
                        <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isEditing && (
            <div className="flex items-center space-x-2">
              <input
                id="isActive"
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={formData.isActive}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, isActive: e.target.checked }))
                }
              />
              <Label htmlFor="isActive" className="font-normal">
                Active (inactive users cannot log in)
              </Label>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create User'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
