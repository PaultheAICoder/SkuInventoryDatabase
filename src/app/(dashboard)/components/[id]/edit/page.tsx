'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { ComponentForm } from '@/components/features/ComponentForm'
import type { ComponentResponse } from '@/types/component'

export default function EditComponentPage() {
  const params = useParams()
  const id = params.id as string
  const [component, setComponent] = useState<ComponentResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchComponent() {
      try {
        const res = await fetch(`/api/components/${id}`)
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error('Component not found')
          }
          throw new Error('Failed to load component')
        }
        const { data } = await res.json()
        setComponent(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setIsLoading(false)
      }
    }

    fetchComponent()
  }, [id])

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-96 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (error || !component) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Link href="/components">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Components
          </Button>
        </Link>
        <div className="rounded-md bg-destructive/10 p-6 text-center text-destructive">
          {error || 'Component not found'}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href={`/components/${id}`}>
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Component
        </Button>
      </Link>
      <div>
        <h1 className="text-3xl font-bold">Edit Component</h1>
        <p className="text-muted-foreground">Update {component.name}</p>
      </div>
      <ComponentForm component={component} />
    </div>
  )
}
