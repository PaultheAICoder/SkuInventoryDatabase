'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { AlertConfigForm } from '@/components/features/AlertConfigForm'

interface AlertConfig {
  id: string
  companyId: string
  slackWebhookUrl: string | null
  hasWebhook: boolean
  emailAddresses: string[]
  enableSlack: boolean
  enableEmail: boolean
  alertMode: 'daily_digest' | 'per_transition'
  lastDigestSent: string | null
}

export default function AlertSettingsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [config, setConfig] = useState<AlertConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchConfig = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/settings/alerts')

      if (res.status === 403) {
        router.push('/')
        return
      }

      if (!res.ok) {
        throw new Error('Failed to load settings')
      }

      const data = await res.json()
      setConfig(data?.data?.config)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [router])

  // Check auth and redirect non-admins
  useEffect(() => {
    if (status === 'loading') return

    if (!session?.user) {
      router.push('/login')
      return
    }

    if (session.user.role !== 'admin') {
      router.push('/')
      return
    }

    fetchConfig()
  }, [session, status, router, fetchConfig])

  // Refetch when company changes
  useEffect(() => {
    if (session?.user?.selectedCompanyId && status === 'authenticated') {
      fetchConfig()
    }
  }, [session?.user?.selectedCompanyId, status, fetchConfig])

  if (status === 'loading' || isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Alert Settings</h1>
          <p className="text-muted-foreground">
            Configure low-stock alert notifications
          </p>
        </div>
        <div className="py-10 text-center text-muted-foreground">
          Loading settings...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Alert Settings</h1>
          <p className="text-muted-foreground">
            Configure low-stock alert notifications
          </p>
        </div>
        <div className="rounded-md bg-destructive/10 p-4 text-destructive">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Alert Settings</h1>
        <p className="text-muted-foreground">
          Configure low-stock alert notifications for Slack and email
        </p>
      </div>

      <div className="max-w-3xl">
        <AlertConfigForm config={config} onRefresh={fetchConfig} />
      </div>
    </div>
  )
}
