import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { createMappingSchema, mappingListQuerySchema } from '@/types/channel-mapping'

// GET /api/shopify/mappings - List mappings (admin and ops can read, viewer cannot)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Viewer role cannot access mappings
    if (session.user.role === 'viewer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const searchParams = Object.fromEntries(request.nextUrl.searchParams)
    const validation = mappingListQuerySchema.safeParse(searchParams)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { page, pageSize, search, channelType, isActive } = validation.data

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    // Build where clause - scope by selected company
    const where: Prisma.SkuChannelMappingWhereInput = {
      companyId: selectedCompanyId,
    }

    if (search) {
      where.OR = [
        { externalId: { contains: search, mode: 'insensitive' } },
        { externalSku: { contains: search, mode: 'insensitive' } },
        { sku: { internalCode: { contains: search, mode: 'insensitive' } } },
        { sku: { name: { contains: search, mode: 'insensitive' } } },
      ]
    }

    if (channelType) {
      where.channelType = channelType
    }

    if (isActive !== undefined) {
      where.isActive = isActive
    }

    // Get total count for SkuChannelMapping
    const channelMappingTotal = await prisma.skuChannelMapping.count({ where })

    // Get mappings with related SKU data
    const channelMappings = await prisma.skuChannelMapping.findMany({
      where,
      select: {
        id: true,
        channelType: true,
        externalId: true,
        externalSku: true,
        skuId: true,
        sku: {
          select: {
            id: true,
            name: true,
            internalCode: true,
          },
        },
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    // Get brands for this company to query AsinSkuMapping
    const brands = await prisma.brand.findMany({
      where: { companyId: selectedCompanyId },
      select: { id: true, name: true },
    })
    const brandIds = brands.map(b => b.id)
    const brandNameMap = Object.fromEntries(brands.map(b => [b.id, b.name]))

    // Only include AsinSkuMapping if not filtering by non-amazon channel
    const includeAsinMappings = !channelType || channelType === 'amazon'

    interface TransformedAsinMapping {
      id: string
      channelType: string
      externalId: string
      externalSku: string | null
      skuId: string
      sku: { id: string; name: string; internalCode: string }
      isActive: boolean
      createdAt: Date
      updatedAt: Date
      source: 'asin'
      productName: string | null
      brandName: string
    }

    let asinMappings: TransformedAsinMapping[] = []

    if (includeAsinMappings && brandIds.length > 0) {
      // Build AsinSkuMapping where clause
      const asinWhere: Prisma.AsinSkuMappingWhereInput = {
        brandId: { in: brandIds },
      }

      if (search) {
        asinWhere.OR = [
          { asin: { contains: search, mode: 'insensitive' } },
          { productName: { contains: search, mode: 'insensitive' } },
          { sku: { internalCode: { contains: search, mode: 'insensitive' } } },
          { sku: { name: { contains: search, mode: 'insensitive' } } },
        ]
      }

      // Note: AsinSkuMapping has no isActive field, so we only filter if isActive is false
      // (meaning we exclude them when explicitly filtering for inactive mappings)
      if (isActive === false) {
        // Don't include ASIN mappings when filtering for inactive (they don't have this state)
        asinMappings = []
      } else {
        const rawAsinMappings = await prisma.asinSkuMapping.findMany({
          where: asinWhere,
          include: {
            sku: { select: { id: true, name: true, internalCode: true } },
          },
          orderBy: { createdAt: 'desc' },
        })

        // Transform to unified format
        asinMappings = rawAsinMappings.map(m => ({
          id: m.id,
          channelType: 'amazon',
          externalId: m.asin,
          externalSku: null,
          skuId: m.skuId,
          sku: m.sku,
          isActive: true, // AsinSkuMapping has no isActive field - always considered active
          createdAt: m.createdAt,
          updatedAt: m.createdAt, // No updatedAt in AsinSkuMapping, use createdAt
          source: 'asin' as const,
          productName: m.productName,
          brandName: brandNameMap[m.brandId] || '',
        }))
      }
    }

    // Combine and sort all mappings by createdAt descending
    const allMappings = [
      ...channelMappings.map(m => ({
        ...m,
        source: 'channel' as const,
        productName: null as string | null,
        brandName: null as string | null,
      })),
      ...asinMappings,
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    // Apply pagination to combined results
    const paginatedMappings = allMappings.slice((page - 1) * pageSize, page * pageSize)
    const combinedTotal = channelMappingTotal + asinMappings.length

    return NextResponse.json({
      data: paginatedMappings.map((mapping) => ({
        ...mapping,
        createdAt: mapping.createdAt.toISOString(),
        updatedAt: mapping.updatedAt.toISOString(),
      })),
      meta: {
        page,
        pageSize,
        total: combinedTotal,
        totalPages: Math.ceil(combinedTotal / pageSize),
      },
    })
  } catch (error) {
    console.error('Error listing mappings:', error)
    return NextResponse.json({ error: 'Failed to list mappings' }, { status: 500 })
  }
}

// POST /api/shopify/mappings - Create mapping (admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const validation = createMappingSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { channelType, externalId, externalSku, skuId } = validation.data

    // Use selected company for scoping
    const selectedCompanyId = session.user.selectedCompanyId

    // Check if mapping already exists for this company/channel/externalId
    const existingMapping = await prisma.skuChannelMapping.findUnique({
      where: {
        companyId_channelType_externalId: {
          companyId: selectedCompanyId,
          channelType,
          externalId,
        },
      },
    })

    if (existingMapping) {
      return NextResponse.json(
        { error: 'A mapping for this external ID already exists' },
        { status: 409 }
      )
    }

    // Verify SKU exists and belongs to selected company
    const sku = await prisma.sKU.findFirst({
      where: {
        id: skuId,
        companyId: selectedCompanyId,
      },
    })

    if (!sku) {
      return NextResponse.json(
        { error: 'SKU not found or does not belong to this company' },
        { status: 400 }
      )
    }

    // Create mapping
    const mapping = await prisma.skuChannelMapping.create({
      data: {
        companyId: selectedCompanyId,
        channelType,
        externalId,
        externalSku: externalSku || null,
        skuId,
      },
      select: {
        id: true,
        channelType: true,
        externalId: true,
        externalSku: true,
        skuId: true,
        sku: {
          select: {
            id: true,
            name: true,
            internalCode: true,
          },
        },
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json(
      {
        data: {
          ...mapping,
          createdAt: mapping.createdAt.toISOString(),
          updatedAt: mapping.updatedAt.toISOString(),
        },
        message: 'Mapping created successfully',
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating mapping:', error)
    return NextResponse.json({ error: 'Failed to create mapping' }, { status: 500 })
  }
}
