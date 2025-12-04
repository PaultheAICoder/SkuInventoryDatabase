import { Suspense } from 'react'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Button } from '@/components/ui/button'
import { ComponentTable } from '@/components/features/ComponentTable'
import { getComponentQuantities, calculateReorderStatus, getCompanySettings } from '@/services/inventory'
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
    locationId?: string
  }>
}

async function getComponents(
  selectedCompanyId: string,
  params: {
    page: number
    pageSize: number
    search?: string
    category?: string
    reorderStatus?: string
    sortBy: string
    sortOrder: 'asc' | 'desc'
    locationId?: string
  }
) {
  // Get company settings
  const settings = await getCompanySettings(selectedCompanyId)

  // Build where clause - scope by companyId
  const where = {
    companyId: selectedCompanyId,
    isActive: true,
    ...(params.category && { category: params.category }),
    ...(params.search && {
      OR: [
        { name: { contains: params.search, mode: 'insensitive' as const } },
        { skuCode: { contains: params.search, mode: 'insensitive' as const } },
      ],
    }),
  }

  // When filtering by reorderStatus, we need to:
  // 1. Fetch ALL matching components (without pagination)
  // 2. Compute reorder status for ALL
  // 3. Filter by reorderStatus
  // 4. Apply pagination to filtered set
  if (params.reorderStatus) {
    // Fetch all components matching other filters (no pagination)
    const allComponents = await prisma.component.findMany({
      where,
      orderBy: { [params.sortBy]: params.sortOrder },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    })

    // Get quantities for ALL components (filtered by location if specified)
    const componentIds = allComponents.map((c) => c.id)
    const quantities = await getComponentQuantities(componentIds, params.locationId)

    // Transform and compute reorder status for ALL
    const allWithStatus: ComponentResponse[] = allComponents.map((component) => {
      const quantityOnHand = quantities.get(component.id) ?? 0
      const status = calculateReorderStatus(quantityOnHand, component.reorderPoint, settings.reorderWarningMultiplier)

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

    // Filter by reorderStatus BEFORE pagination
    const filtered = allWithStatus.filter((c) => c.reorderStatus === params.reorderStatus)

    // Apply pagination to filtered set
    const start = (params.page - 1) * params.pageSize
    const paginatedData = filtered.slice(start, start + params.pageSize)

    return {
      components: paginatedData,
      total: filtered.length, // Total of ALL matching records, not just current page
    }
  }

  // Original logic for non-reorderStatus queries (unchanged)
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

  // Get quantities (filtered by location if specified)
  const componentIds = components.map((c) => c.id)
  const quantities = await getComponentQuantities(componentIds, params.locationId)

  // Transform response with computed fields
  const data: ComponentResponse[] = components.map((component) => {
    const quantityOnHand = quantities.get(component.id) ?? 0
    const status = calculateReorderStatus(quantityOnHand, component.reorderPoint, settings.reorderWarningMultiplier)

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

  return {
    components: data,
    total,
  }
}

export default async function ComponentsPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    redirect('/login')
  }

  const params = await searchParams

  // Use selected company for scoping
  const selectedCompanyId = session.user.selectedCompanyId

  const page = parseInt(params.page ?? '1', 10)
  const pageSize = parseInt(params.pageSize ?? '50', 10)

  const { components, total } = await getComponents(selectedCompanyId, {
    page,
    pageSize,
    search: params.search,
    category: params.category,
    reorderStatus: params.reorderStatus,
    sortBy: params.sortBy ?? 'name',
    sortOrder: (params.sortOrder as 'asc' | 'desc') ?? 'asc',
    locationId: params.locationId,
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
