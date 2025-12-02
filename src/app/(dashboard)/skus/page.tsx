import { Suspense } from 'react'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { SKUTable } from '@/components/features/SKUTable'
import { ExportButton } from '@/components/features/ExportButton'

interface SearchParams {
  page?: string
  pageSize?: string
  search?: string
  salesChannel?: string
  sortBy?: string
  sortOrder?: string
}

async function getSKUs(searchParams: SearchParams) {
  const session = await getServerSession(authOptions)
  if (!session) return { data: [], meta: { total: 0, page: 1, pageSize: 50 } }

  const params = new URLSearchParams()
  if (searchParams.page) params.set('page', searchParams.page)
  if (searchParams.pageSize) params.set('pageSize', searchParams.pageSize)
  if (searchParams.search) params.set('search', searchParams.search)
  if (searchParams.salesChannel) params.set('salesChannel', searchParams.salesChannel)
  if (searchParams.sortBy) params.set('sortBy', searchParams.sortBy)
  if (searchParams.sortOrder) params.set('sortOrder', searchParams.sortOrder)

  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  const res = await fetch(`${baseUrl}/api/skus?${params.toString()}`, {
    headers: {
      cookie: `next-auth.session-token=${session.user.id}`,
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    return { data: [], meta: { total: 0, page: 1, pageSize: 50 } }
  }

  return res.json()
}

export default async function SKUsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await getServerSession(authOptions)
  if (!session) {
    redirect('/login')
  }

  const params = await searchParams
  const { data: skus, meta } = await getSKUs(params)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">SKUs</h1>
          <p className="text-muted-foreground">Manage sellable product configurations</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton exportType="skus" />
          <Button asChild>
            <Link href="/skus/new">
              <Plus className="mr-2 h-4 w-4" />
              New SKU
            </Link>
          </Button>
        </div>
      </div>

      <Suspense fallback={<div>Loading...</div>}>
        <SKUTable
          skus={skus}
          total={meta.total}
          page={meta.page}
          pageSize={meta.pageSize}
        />
      </Suspense>
    </div>
  )
}
