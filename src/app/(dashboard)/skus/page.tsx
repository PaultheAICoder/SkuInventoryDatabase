import { Suspense } from 'react'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { SKUTable } from '@/components/features/SKUTable'
import { ExportButton } from '@/components/features/ExportButton'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { calculateBOMUnitCosts, calculateMaxBuildableUnitsForSKUs } from '@/services/bom'

interface SearchParams {
  page?: string
  pageSize?: string
  search?: string
  salesChannel?: string
  sortBy?: string
  sortOrder?: string
  locationId?: string
}

async function getSKUs(searchParams: SearchParams, selectedCompanyId: string) {
  const page = parseInt(searchParams.page || '1', 10)
  const pageSize = parseInt(searchParams.pageSize || '50', 10)
  const search = searchParams.search
  const salesChannel = searchParams.salesChannel
  const sortBy = (searchParams.sortBy || 'createdAt') as keyof Prisma.SKUOrderByWithRelationInput
  const sortOrder = (searchParams.sortOrder || 'desc') as 'asc' | 'desc'
  const locationId = searchParams.locationId

  // Build where clause - scope by companyId
  const where: Prisma.SKUWhereInput = {
    companyId: selectedCompanyId,
    ...(salesChannel && { salesChannel }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { internalCode: { contains: search, mode: 'insensitive' } },
      ],
    }),
  }

  // Get total count
  const total = await prisma.sKU.count({ where })

  // Get SKUs with active BOM
  const skus = await prisma.sKU.findMany({
    where,
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: { [sortBy]: sortOrder },
    include: {
      createdBy: { select: { id: true, name: true } },
      bomVersions: {
        where: { isActive: true },
        take: 1,
        select: {
          id: true,
          versionName: true,
        },
      },
    },
  })

  // Get BOM costs and buildable units
  const skuIds = skus.map((s) => s.id)
  const activeBomIds = skus
    .filter((s) => s.bomVersions[0])
    .map((s) => s.bomVersions[0].id)

  const [bomCosts, buildableUnits] = await Promise.all([
    activeBomIds.length > 0 ? calculateBOMUnitCosts(activeBomIds) : new Map<string, number>(),
    skuIds.length > 0 ? calculateMaxBuildableUnitsForSKUs(skuIds, locationId) : new Map<string, number | null>(),
  ])

  // Transform response
  const data = skus.map((sku) => {
    const activeBom = sku.bomVersions[0]
    const unitCost = activeBom ? bomCosts.get(activeBom.id) ?? 0 : null

    return {
      id: sku.id,
      name: sku.name,
      internalCode: sku.internalCode,
      salesChannel: sku.salesChannel,
      externalIds: sku.externalIds as Record<string, string>,
      notes: sku.notes,
      isActive: sku.isActive,
      createdAt: sku.createdAt.toISOString(),
      updatedAt: sku.updatedAt.toISOString(),
      createdBy: sku.createdBy,
      activeBom: activeBom
        ? {
            id: activeBom.id,
            versionName: activeBom.versionName,
            unitCost: unitCost?.toFixed(4) ?? '0.0000',
          }
        : null,
      maxBuildableUnits: buildableUnits.get(sku.id) ?? null,
    }
  })

  return { data, meta: { total, page, pageSize } }
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
  const { data: skus, meta } = await getSKUs(params, selectedCompanyId)

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
