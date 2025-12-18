import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSelectedCompanyRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  companySettingsSchema,
  updateSettingsSchema,
  DEFAULT_SETTINGS,
  type CompanySettings,
} from '@/types/settings'

// GET /api/settings - Get company settings (admin only)
export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check selectedCompanyId BEFORE role check to return proper 400 error
    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return NextResponse.json(
        { error: 'No company selected. Please refresh the page and try again.' },
        { status: 400 }
      )
    }

    const companyRole = getSelectedCompanyRole(session)
    if (companyRole !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const company = await prisma.company.findUnique({
      where: { id: selectedCompanyId },
      select: {
        id: true,
        name: true,
        settings: true,
        updatedAt: true,
      },
    })

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    // Merge stored settings with defaults
    const storedSettings = (company.settings as Record<string, unknown>) || {}
    const settings = { ...DEFAULT_SETTINGS, ...storedSettings } as CompanySettings

    // Validate settings against schema
    const validated = companySettingsSchema.safeParse(settings)
    const finalSettings = validated.success ? validated.data : DEFAULT_SETTINGS

    return NextResponse.json({
      data: {
        companyId: company.id,
        companyName: company.name,
        settings: finalSettings,
        updatedAt: company.updatedAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('Error fetching settings:', error)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

// PATCH /api/settings - Update company settings (admin only)
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check selectedCompanyId BEFORE role check to return proper 400 error
    const selectedCompanyId = session.user.selectedCompanyId
    if (!selectedCompanyId) {
      return NextResponse.json(
        { error: 'No company selected. Please refresh the page and try again.' },
        { status: 400 }
      )
    }

    const companyRole = getSelectedCompanyRole(session)
    if (companyRole !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const validation = updateSettingsSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    // Get current company settings
    const company = await prisma.company.findUnique({
      where: { id: selectedCompanyId },
      select: {
        id: true,
        name: true,
        settings: true,
      },
    })

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    // Merge new settings with existing
    const currentSettings = (company.settings as Record<string, unknown>) || {}
    const newSettings = { ...DEFAULT_SETTINGS, ...currentSettings, ...validation.data }

    // Update company settings
    const updatedCompany = await prisma.company.update({
      where: { id: selectedCompanyId },
      data: {
        settings: newSettings,
      },
      select: {
        id: true,
        name: true,
        settings: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({
      data: {
        companyId: updatedCompany.id,
        companyName: updatedCompany.name,
        settings: newSettings,
        updatedAt: updatedCompany.updatedAt.toISOString(),
      },
      message: 'Settings updated successfully',
    })
  } catch (error) {
    console.error('Error updating settings:', error)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
