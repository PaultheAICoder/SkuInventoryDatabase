'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { SettingsForm } from '@/components/features/SettingsForm'
import type { SettingsResponse, CompanySettings } from '@/types/settings'

export default function SettingsPage() {
  const { data: session, status } = useSession()
  const [settings, setSettings] = useState<SettingsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSettings = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/settings')
      if (!res.ok) {
        throw new Error('Failed to load settings')
      }
      const data = await res.json().catch(() => ({}))
      setSettings(data?.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Refetch when company changes
  useEffect(() => {
    // Don't fetch while session is loading
    if (status === 'loading') return

    // If authenticated with a company selected, fetch settings
    if (session?.user?.selectedCompanyId) {
      fetchSettings()
    } else {
      // Session loaded but no company - stop loading
      setIsLoading(false)
    }
  }, [status, session?.user?.selectedCompanyId, fetchSettings])

  const handleSave = async (newSettings: Partial<CompanySettings>) => {
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSettings),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error || 'Failed to save settings')
    }

    // Refresh settings
    await fetchSettings()
  }

  if (status === 'loading' || isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Configure your organization settings</p>
        </div>
        <div className="py-10 text-center text-muted-foreground">Loading settings...</div>
      </div>
    )
  }

  if (error || !settings) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Configure your organization settings</p>
        </div>
        <div className="rounded-md bg-destructive/10 p-4 text-destructive">
          {error || 'Failed to load settings'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure your organization settings</p>
      </div>

      <div className="max-w-3xl">
        <SettingsForm
          settings={settings.settings}
          companyName={settings.companyName}
          onSave={handleSave}
        />
      </div>
    </div>
  )
}
