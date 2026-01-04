/**
 * GET/PUT /api/thresholds
 *
 * Brand-specific recommendation threshold configuration.
 * Thresholds are stored in Company.settings.brandThresholds[brandId] JSON field.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSelectedCompanyRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  recommendationThresholdsSchema,
  type RecommendationThresholds,
} from '@/types/recommendations'
import { DEFAULT_THRESHOLDS, mergeThresholds } from '@/lib/recommendation-utils'

// GET /api/thresholds - Get thresholds for selected brand
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const selectedBrandId = session.user.selectedBrandId
    if (!selectedBrandId) {
      return NextResponse.json(
        { error: 'No brand selected. Please select a brand.' },
        { status: 400 }
      )
    }

    // Fetch brand with company settings
    const brand = await prisma.brand.findUnique({
      where: { id: selectedBrandId },
      include: { company: { select: { id: true, settings: true } } },
    })

    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    // Extract settings
    const companySettings = brand.company.settings as Record<string, unknown> | null
    const brandThresholds = (companySettings?.brandThresholds as Record<string, RecommendationThresholds> | undefined)?.[selectedBrandId]
    const companyThresholds = companySettings?.recommendationThresholds as RecommendationThresholds | undefined

    // Merge thresholds: brand-specific > company > defaults
    const effectiveThresholds = mergeThresholds(brandThresholds, companyThresholds)

    return NextResponse.json({
      data: {
        brandId: brand.id,
        brandName: brand.name,
        thresholds: effectiveThresholds,
        brandOverrides: brandThresholds || null,
        defaults: DEFAULT_THRESHOLDS,
      },
    })
  } catch (error) {
    console.error('Error fetching thresholds:', error)
    return NextResponse.json({ error: 'Failed to fetch thresholds' }, { status: 500 })
  }
}

// PUT /api/thresholds - Update thresholds for selected brand
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Admin only
    const companyRole = getSelectedCompanyRole(session)
    if (companyRole !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const selectedBrandId = session.user.selectedBrandId
    if (!selectedBrandId) {
      return NextResponse.json(
        { error: 'No brand selected. Please select a brand.' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const validation = recommendationThresholdsSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    // Get current brand
    const brand = await prisma.brand.findUnique({
      where: { id: selectedBrandId },
    })

    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    // Store per-brand thresholds in Company.settings.brandThresholds
    const company = await prisma.company.findUnique({
      where: { id: brand.companyId },
      select: { settings: true },
    })

    const currentSettings = (company?.settings as Record<string, unknown>) || {}
    const brandThresholdsMap = (currentSettings.brandThresholds as Record<string, unknown>) || {}

    const newSettings = {
      ...currentSettings,
      brandThresholds: {
        ...brandThresholdsMap,
        [selectedBrandId]: validation.data,
      },
    }

    // Serialize to ensure Prisma accepts it as valid JSON
    await prisma.company.update({
      where: { id: brand.companyId },
      data: { settings: JSON.parse(JSON.stringify(newSettings)) },
    })

    return NextResponse.json({
      data: {
        brandId: selectedBrandId,
        thresholds: validation.data,
      },
      message: 'Thresholds updated successfully',
    })
  } catch (error) {
    console.error('Error updating thresholds:', error)
    return NextResponse.json({ error: 'Failed to update thresholds' }, { status: 500 })
  }
}
