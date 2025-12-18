/**
 * ASIN to SKU Mapping API Routes
 *
 * Manages mappings between Amazon ASINs and internal SKU codes.
 * GET /api/asin-mapping - List mappings with unmapped ASIN detection
 * POST /api/asin-mapping - Create new mapping
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSelectedCompanyRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { error } from '@/lib/api-response'

interface SKUSuggestion {
  id: string
  sku: string
  name: string
  similarity: number
}

/**
 * Calculate simple string similarity (Jaccard index on words)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.toLowerCase().split(/\s+/).filter(w => w.length > 2))
  const words2 = new Set(str2.toLowerCase().split(/\s+/).filter(w => w.length > 2))

  if (words1.size === 0 || words2.size === 0) return 0

  const intersection = new Set(Array.from(words1).filter(w => words2.has(w)))
  const union = new Set([...Array.from(words1), ...Array.from(words2)])

  return intersection.size / union.size
}

/**
 * GET /api/asin-mapping
 * List ASIN mappings with optional unmapped ASINs from ad data
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const brandId = searchParams.get('brandId')
    const includeUnmapped = searchParams.get('includeUnmapped') === 'true'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const skip = (page - 1) * limit

    // Use selected company from session
    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return error('No company selected. Please select a company from the sidebar.', 400)
    }

    // Get brands for this company
    const brands = await prisma.brand.findMany({
      where: { companyId: selectedCompanyId },
      select: { id: true, name: true },
    })
    const brandIds = brands.map(b => b.id)

    // Filter by brand if specified
    const filterBrandIds = brandId ? [brandId] : brandIds

    // Get existing mappings
    const mappings = await prisma.asinSkuMapping.findMany({
      where: {
        brandId: { in: filterBrandIds },
      },
      include: {
        brand: { select: { id: true, name: true } },
        sku: { select: { id: true, internalCode: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    })

    // Get total count
    const totalMappings = await prisma.asinSkuMapping.count({
      where: { brandId: { in: filterBrandIds } },
    })

    // Result object
    const result: {
      mappings: typeof mappings
      unmapped?: Array<{ asin: string; productName: string | null; brandId: string; brandName: string; suggestions: SKUSuggestion[] }>
      totalMappings: number
      totalUnmapped?: number
      page: number
      limit: number
    } = {
      mappings,
      totalMappings,
      page,
      limit,
    }

    // Get unmapped ASINs from ad data if requested
    if (includeUnmapped) {
      // Find ASINs in SalesDaily that don't have mappings
      const salesdailyAsins = await prisma.salesDaily.findMany({
        where: {
          brandId: { in: filterBrandIds },
          asin: { not: null },
        },
        select: {
          asin: true,
          brandId: true,
          brand: { select: { name: true } },
        },
        distinct: ['asin', 'brandId'],
      })

      // Get mapped ASINs set
      const mappedAsins = new Set(
        (await prisma.asinSkuMapping.findMany({
          where: { brandId: { in: filterBrandIds } },
          select: { asin: true, brandId: true },
        })).map(m => `${m.brandId}:${m.asin}`)
      )

      // Filter to unmapped ASINs
      const unmappedAsins = salesdailyAsins.filter(
        s => s.asin && !mappedAsins.has(`${s.brandId}:${s.asin}`)
      )

      // Get SKUs for suggestions
      const skus = await prisma.sKU.findMany({
        where: { companyId: selectedCompanyId },
        select: { id: true, internalCode: true, name: true },
      })

      // Build unmapped list with suggestions
      const unmapped = unmappedAsins.map(u => {
        // Calculate suggestions based on similarity
        const suggestions: SKUSuggestion[] = skus
          .map(sku => ({
            id: sku.id,
            sku: sku.internalCode,
            name: sku.name,
            similarity: calculateSimilarity(u.asin || '', sku.internalCode) +
                       calculateSimilarity(u.asin || '', sku.name || ''),
          }))
          .filter(s => s.similarity > 0)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 5)

        return {
          asin: u.asin!,
          productName: null, // We don't have product name from SalesDaily
          brandId: u.brandId,
          brandName: u.brand.name,
          suggestions,
        }
      })

      result.unmapped = unmapped
      result.totalUnmapped = unmapped.length
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('ASIN mapping list error:', error)
    return NextResponse.json(
      { error: 'Failed to list mappings' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/asin-mapping
 * Create a new ASIN-SKU mapping
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { brandId, asin, skuId, productName } = body as {
      brandId: string
      asin: string
      skuId: string
      productName?: string
    }

    // Validate required fields
    if (!brandId || !asin || !skuId) {
      return NextResponse.json(
        { error: 'brandId, asin, and skuId are required' },
        { status: 400 }
      )
    }

    // Validate ASIN format (10 alphanumeric characters)
    if (!/^[A-Z0-9]{10}$/i.test(asin)) {
      return NextResponse.json(
        { error: 'Invalid ASIN format (must be 10 alphanumeric characters)' },
        { status: 400 }
      )
    }

    // Use selected company from session
    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return error('No company selected. Please select a company from the sidebar.', 400)
    }

    // Only admin can create ASIN mappings (check via company-specific role)
    const companyRole = getSelectedCompanyRole(session)
    if (companyRole !== 'admin') {
      return NextResponse.json(
        { error: 'Only admins can create ASIN mappings' },
        { status: 403 }
      )
    }

    // Verify brand belongs to user's company
    const brand = await prisma.brand.findFirst({
      where: { id: brandId, companyId: selectedCompanyId },
    })

    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    // Verify SKU exists and belongs to user's company
    const sku = await prisma.sKU.findFirst({
      where: { id: skuId, companyId: selectedCompanyId },
    })

    if (!sku) {
      return NextResponse.json({ error: 'SKU not found' }, { status: 404 })
    }

    // Check for duplicate mapping
    const existing = await prisma.asinSkuMapping.findUnique({
      where: { brandId_asin: { brandId, asin: asin.toUpperCase() } },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'Mapping already exists for this ASIN' },
        { status: 409 }
      )
    }

    // Create mapping
    const mapping = await prisma.asinSkuMapping.create({
      data: {
        brandId,
        asin: asin.toUpperCase(),
        skuId,
        productName,
        createdById: session.user.id,
      },
      include: {
        brand: { select: { id: true, name: true } },
        sku: { select: { id: true, internalCode: true, name: true } },
      },
    })

    return NextResponse.json(mapping, { status: 201 })
  } catch (error) {
    console.error('ASIN mapping create error:', error)
    return NextResponse.json(
      { error: 'Failed to create mapping' },
      { status: 500 }
    )
  }
}
