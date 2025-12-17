import { Suspense } from 'react'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { SKUTable } from '@/components/features/SKUTable'
import { SKUTableSkeleton } from '@/components/features/SKUTableSkeleton'
import { ExportButton } from '@/components/features/ExportButton'
import { getSkusWithCosts } from '@/services/sku'

interface SearchParams {
  page?: string
  pageSize?: string
  search?: string
  salesChannel?: string
  sortBy?: string
  sortOrder?: string
  locationId?: string
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

  // Use selected company for scoping
  const selectedCompanyId = session.user.selectedCompanyId
  const selectedBrandId = session.user.selectedBrandId

  // Use service to get SKUs with costs
  const { data: skus, meta } = await getSkusWithCosts({
    companyId: selectedCompanyId,
    brandId: selectedBrandId ?? undefined,
    page: parseInt(params.page || '1', 10),
    pageSize: parseInt(params.pageSize || '50', 10),
    search: params.search,
    salesChannel: params.salesChannel,
    sortBy: (params.sortBy || 'createdAt') as 'name' | 'internalCode' | 'salesChannel' | 'createdAt',
    sortOrder: (params.sortOrder || 'desc') as 'asc' | 'desc',
    locationId: params.locationId,
  })

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

      <Suspense fallback={<SKUTableSkeleton />}>
        <SKUTable
          skus={skus}
          total={meta.total}
          page={meta.page}
          pageSize={meta.pageSize}
          locationId={params.locationId}
        />
      </Suspense>
    </div>
  )
}
