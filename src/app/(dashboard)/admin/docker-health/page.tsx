'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { DockerHealthDashboard } from '@/components/features/DockerHealthDashboard'
import type { DockerHealthDashboardData } from '@/types/container-health'

export default function DockerHealthPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [dashboardData, setDashboardData] = useState<DockerHealthDashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/admin/docker-health')

      if (res.status === 403) {
        router.push('/')
        return
      }

      if (!res.ok) {
        throw new Error('Failed to load data')
      }

      const data = await res.json()
      setDashboardData(data.data)
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

    fetchData()
  }, [session, status, router, fetchData])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (status !== 'authenticated' || session?.user?.role !== 'admin') return

    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [status, session?.user?.role, fetchData])

  if (status === 'loading' || isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Docker Health Monitor</h1>
          <p className="text-muted-foreground">
            Monitor container status and health history
          </p>
        </div>
        <div className="py-10 text-center text-muted-foreground">
          Loading...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Docker Health Monitor</h1>
          <p className="text-muted-foreground">
            Monitor container status and health history
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
        <h1 className="text-3xl font-bold">Docker Health Monitor</h1>
        <p className="text-muted-foreground">
          Monitor container status, health history, and configure alerts
        </p>
      </div>

      <DockerHealthDashboard
        data={dashboardData}
        onRefresh={fetchData}
      />
    </div>
  )
}
