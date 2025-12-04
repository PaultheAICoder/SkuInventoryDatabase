'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { OrderReviewTable } from '@/components/features/OrderReviewTable'
import type { OrderResponse } from '@/types/shopify-sync'

export default function OrdersPage() {
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const [orders, setOrders] = useState<OrderResponse[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const pageSize = parseInt(searchParams.get('pageSize') ?? '50', 10)

  const fetchOrders = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      params.set('page', page.toString())
      params.set('pageSize', pageSize.toString())

      const status = searchParams.get('status')
      if (status) params.set('status', status)

      const search = searchParams.get('search')
      if (search) params.set('search', search)

      const hasUnmappedLines = searchParams.get('hasUnmappedLines')
      if (hasUnmappedLines) params.set('hasUnmappedLines', hasUnmappedLines)

      const res = await fetch(`/api/shopify/orders?${params}`)

      if (res.status === 403) {
        setError('You do not have permission to view orders')
        return
      }

      if (!res.ok) {
        throw new Error('Failed to fetch orders')
      }

      const data = await res.json()
      setOrders(data.data || [])
      setTotal(data.meta?.total || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [page, pageSize, searchParams])

  useEffect(() => {
    if (session?.user?.selectedCompanyId) {
      fetchOrders()
    }
  }, [session?.user?.selectedCompanyId, fetchOrders])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Order Review</h1>
          <p className="text-muted-foreground">Review and approve synced Shopify orders</p>
        </div>
        <div className="py-10 text-center text-muted-foreground">Loading orders...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Order Review</h1>
          <p className="text-muted-foreground">Review and approve synced Shopify orders</p>
        </div>
        <div className="rounded-md bg-destructive/10 p-4 text-destructive">{error}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Order Review</h1>
        <p className="text-muted-foreground">Review and approve synced Shopify orders</p>
      </div>

      <OrderReviewTable orders={orders} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
