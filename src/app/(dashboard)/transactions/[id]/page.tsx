'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { TransactionDetail } from '@/components/features/TransactionDetail'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function TransactionDetailPage({ params }: PageProps) {
  const { id } = use(params)
  const router = useRouter()
  const [transaction, setTransaction] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchTransaction() {
      try {
        const res = await fetch(`/api/transactions/${id}`)
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error('Transaction not found')
          }
          throw new Error('Failed to load transaction')
        }
        const data = await res.json()
        setTransaction(data.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setIsLoading(false)
      }
    }

    fetchTransaction()
  }, [id])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/transactions">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Transactions
            </Button>
          </Link>
        </div>
        <div className="h-64 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (error || !transaction) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/transactions">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Transactions
            </Button>
          </Link>
        </div>
        <div className="rounded-md bg-destructive/10 p-6 text-center">
          <p className="text-destructive">{error || 'Transaction not found'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/transactions">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Transactions
          </Button>
        </Link>
      </div>

      <TransactionDetail transaction={transaction} />
    </div>
  )
}
