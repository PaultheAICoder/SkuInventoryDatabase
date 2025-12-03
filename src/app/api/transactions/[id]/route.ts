import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const transaction = await prisma.transaction.findUnique({
      where: {
        id,
        companyId: session.user.companyId,
      },
      include: {
        company: {
          select: { id: true, name: true },
        },
        sku: {
          select: {
            id: true,
            name: true,
            internalCode: true,
          },
        },
        bomVersion: {
          select: {
            id: true,
            versionName: true,
          },
        },
        location: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        lines: {
          include: {
            component: {
              select: {
                id: true,
                name: true,
                skuCode: true,
                unitOfMeasure: true,
              },
            },
          },
        },
        createdBy: {
          select: { id: true, name: true },
        },
      },
    })

    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    return NextResponse.json({
      data: {
        id: transaction.id,
        type: transaction.type,
        date: transaction.date.toISOString().split('T')[0],
        company: transaction.company,
        sku: transaction.sku,
        bomVersion: transaction.bomVersion,
        locationId: transaction.locationId,
        location: transaction.location,
        salesChannel: transaction.salesChannel,
        unitsBuild: transaction.unitsBuild,
        unitBomCost: transaction.unitBomCost?.toString() ?? null,
        totalBomCost: transaction.totalBomCost?.toString() ?? null,
        supplier: transaction.supplier,
        reason: transaction.reason,
        notes: transaction.notes,
        defectCount: transaction.defectCount,
        defectNotes: transaction.defectNotes,
        affectedUnits: transaction.affectedUnits,
        createdAt: transaction.createdAt.toISOString(),
        createdBy: transaction.createdBy,
        lines: transaction.lines.map((line) => ({
          id: line.id,
          component: {
            id: line.component.id,
            name: line.component.name,
            skuCode: line.component.skuCode,
            unitOfMeasure: line.component.unitOfMeasure,
          },
          quantityChange: line.quantityChange.toString(),
          costPerUnit: line.costPerUnit?.toString() ?? null,
          lineCost: line.costPerUnit
            ? (
                Math.abs(line.quantityChange.toNumber()) * line.costPerUnit.toNumber()
              ).toFixed(4)
            : null,
        })),
        // Calculated summary for build transactions
        summary:
          transaction.type === 'build'
            ? {
                componentsConsumed: transaction.lines.length,
                totalUnitsBuilt: transaction.unitsBuild,
                totalCost: transaction.totalBomCost?.toString() ?? null,
              }
            : null,
      },
    })
  } catch (error) {
    console.error('Error fetching transaction:', error)
    return NextResponse.json({ error: 'Failed to fetch transaction' }, { status: 500 })
  }
}
