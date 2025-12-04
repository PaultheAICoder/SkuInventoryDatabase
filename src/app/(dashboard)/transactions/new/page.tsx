import { Suspense } from 'react'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { QuickEntryWrapper } from '@/components/features/QuickEntryWrapper'

export default async function QuickEntryPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    redirect('/login')
  }

  // Check role - Viewer cannot create transactions
  if (session.user.role === 'viewer') {
    redirect('/transactions')
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Quick Entry</h1>
        <p className="text-muted-foreground">Record a new transaction using forms or natural language</p>
      </div>
      <Suspense fallback={<div className="text-muted-foreground">Loading...</div>}>
        <QuickEntryWrapper />
      </Suspense>
    </div>
  )
}
