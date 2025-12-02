import { Suspense } from 'react'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Button } from '@/components/ui/button'
import { ComponentTable } from '@/components/features/ComponentTable'
import { getComponentQuantities, calculateReorderStatus } from '@/services/inventory'
import { Plus } from 'lucide-react'
import { ExportButton } from '@/components/features/ExportButton'
import type { ComponentResponse } from '@/types/component'

interface PageProps {
  searchParams: Promise<{
    page?: string
    pageSize?: string
    search?: string
    category?: string
    reorderStatus?: string
    sortBy?: string
    sortOrder?: string
  }>
}

async function getComponents(
  brandId: string,
  params: {
    page: number
    pageSize: number
    search?: string
    category?: string
    reorderStatus?: string
    sortBy: string
    sortOrder: 'asc' | 'desc'
  }
) {
  const where = {
    brandId,
    isActive: true,
    ...(params.category && { category: params.category }),
    ...(params.search && {
      OR: [
        { name: { contains: params.search, mode: 'insensitive' as const } },
        { skuCode: { contains: params.search, mode: 'insensitive' as const } },
      ],
    }),
  }

  const [total, components] = await Promise.all([
    prisma.component.count({ where }),
    prisma.component.findMany({
      where,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      orderBy: { [params.sortBy]: params.sortOrder },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    }),
  ])

  // Get quantities
  const componentIds = components.map((c) => c.id)
  const quantities = await getComponentQuantities(componentIds)

  // Transform response with computed fields
  let data: ComponentResponse[] = components.map((component) => {
    const quantityOnHand = quantities.get(component.id) ?? 0
    const status = calculateReorderStatus(quantityOnHand, component.reorderPoint)

    return {
      id: component.id,
      name: component.name,
      skuCode: component.skuCode,
      category: component.category,
      unitOfMeasure: component.unitOfMeasure,
      costPerUnit: component.costPerUnit.toString(),
      reorderPoint: component.reorderPoint,
      leadTimeDays: component.leadTimeDays,
      notes: component.notes,
      isActive: component.isActive,
      quantityOnHand,
      reorderStatus: status,
      createdAt: component.createdAt.toISOString(),
      updatedAt: component.updatedAt.toISOString(),
      createdBy: component.createdBy,
    }
  })

  // Filter by reorder status if specified
  if (params.reorderStatus) {
    data = data.filter((c) => c.reorderStatus === params.reorderStatus)
  }

  return {
    components: data,
    total: params.reorderStatus ? data.length : total,
  }
}

export default async function ComponentsPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    redirect('/login')
  }

  const params = await searchParams

  // Get user's brand
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { company: { include: { brands: { where: { isActive: true }, take: 1 } } } },
  })

  if (!user?.company.brands[0]) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Components</h1>
        <p className="text-muted-foreground">No active brand found. Please contact an administrator.</p>
      </div>
    )
  }

  const brandId = user.company.brands[0].id

  const page = parseInt(params.page ?? '1', 10)
  const pageSize = parseInt(params.pageSize ?? '50', 10)

  const { components, total } = await getComponents(brandId, {
    page,
    pageSize,
    search: params.search,
    category: params.category,
    reorderStatus: params.reorderStatus,
    sortBy: params.sortBy ?? 'name',
    sortOrder: (params.sortOrder as 'asc' | 'desc') ?? 'asc',
  })

  const canCreate = session.user.role !== 'viewer'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Components</h1>
          <p className="text-muted-foreground">Manage your component inventory</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton exportType="components" />
          {canCreate && (
            <Link href="/components/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Component
              </Button>
            </Link>
          )}
        </div>
      </div>

      <Suspense fallback={<div>Loading...</div>}>
        <ComponentTable components={components} total={total} page={page} pageSize={pageSize} />
      </Suspense>
    </div>
  )
}
