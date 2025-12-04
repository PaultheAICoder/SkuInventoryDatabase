'use client'

import { DraftTransactionList } from '@/components/features/DraftTransactionList'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Plus } from 'lucide-react'
import Link from 'next/link'

export default function DraftsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/transactions">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Review Drafts</h1>
            <p className="text-muted-foreground">
              Review and approve pending draft transactions
            </p>
          </div>
        </div>
        <Link href="/transactions/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Transaction
          </Button>
        </Link>
      </div>

      {/* Draft List */}
      <DraftTransactionList />
    </div>
  )
}
