'use client'

import { useState, useEffect } from 'react'
import { SettingsForm } from '@/components/features/SettingsForm'
import type { SettingsResponse, CompanySettings } from '@/types/settings'

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings')
      if (!res.ok) {
        throw new Error('Failed to load settings')
      }
      const data = await res.json()
      setSettings(data.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  const handleSave = async (newSettings: Partial<CompanySettings>) => {
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSettings),
    })

    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Failed to save settings')
    }

    // Refresh settings
    await fetchSettings()
  }

  if (isLoading) {
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
