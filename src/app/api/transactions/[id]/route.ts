import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, getSelectedCompanyRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { updateTransaction, deleteTransaction } from '@/services/transaction-edit'
import {
  updateReceiptSchema,
  updateAdjustmentSchema,
  updateInitialSchema,
  updateTransferSchema,
  updateBuildSchema,
  updateOutboundSchema,
} from '@/types/transaction-edit'
import { toLocalDateString } from '@/lib/utils'

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
        companyId: session.user.selectedCompanyId,
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
        fromLocation: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        toLocation: {
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
        finishedGoodsLines: {
          include: {
            sku: {
              select: {
                id: true,
                name: true,
                internalCode: true,
              },
            },
            location: {
              select: {
                id: true,
                name: true,
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
        date: toLocalDateString(transaction.date),
        company: transaction.company,
        sku: transaction.sku,
        bomVersion: transaction.bomVersion,
        locationId: transaction.locationId,
        location: transaction.location,
        fromLocationId: transaction.fromLocationId,
        fromLocation: transaction.fromLocation,
        toLocationId: transaction.toLocationId,
        toLocation: transaction.toLocation,
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
        finishedGoodsLines: transaction.finishedGoodsLines.map((fgLine) => ({
          id: fgLine.id,
          skuId: fgLine.skuId,
          skuName: fgLine.sku.name,
          skuInternalCode: fgLine.sku.internalCode,
          quantityChange: fgLine.quantityChange.toString(),
          costPerUnit: fgLine.costPerUnit?.toString() ?? null,
          locationId: fgLine.locationId,
          locationName: fgLine.location.name,
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

// PUT /api/transactions/[id] - Update an approved transaction
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check role - Viewer cannot update transactions
    const companyRole = getSelectedCompanyRole(session)
    if (companyRole === 'viewer') {
      return NextResponse.json(
        { error: 'You do not have permission to update transactions' },
        { status: 403 }
      )
    }

    const { id } = await params
    const body = await request.json()
    const selectedCompanyId = session.user.selectedCompanyId

    // First fetch the transaction to determine its type
    const existingTransaction = await prisma.transaction.findFirst({
      where: {
        id,
        companyId: selectedCompanyId,
        status: 'approved', // Can only edit approved transactions
      },
    })

    if (!existingTransaction) {
      return NextResponse.json(
        { error: 'Transaction not found or cannot be edited' },
        { status: 404 }
      )
    }

    // Validate input based on transaction type
    let validatedInput: Record<string, unknown>
    switch (existingTransaction.type) {
      case 'receipt': {
        const receiptResult = updateReceiptSchema.safeParse(body)
        if (!receiptResult.success) {
          return NextResponse.json(
            { error: receiptResult.error.issues[0].message },
            { status: 400 }
          )
        }
        validatedInput = receiptResult.data
        break
      }
      case 'adjustment': {
        const adjustmentResult = updateAdjustmentSchema.safeParse(body)
        if (!adjustmentResult.success) {
          return NextResponse.json(
            { error: adjustmentResult.error.issues[0].message },
            { status: 400 }
          )
        }
        validatedInput = adjustmentResult.data
        break
      }
      case 'initial': {
        const initialResult = updateInitialSchema.safeParse(body)
        if (!initialResult.success) {
          return NextResponse.json(
            { error: initialResult.error.issues[0].message },
            { status: 400 }
          )
        }
        validatedInput = initialResult.data
        break
      }
      case 'transfer': {
        const transferResult = updateTransferSchema.safeParse(body)
        if (!transferResult.success) {
          return NextResponse.json(
            { error: transferResult.error.issues[0].message },
            { status: 400 }
          )
        }
        validatedInput = transferResult.data
        break
      }
      case 'build': {
        const buildResult = updateBuildSchema.safeParse(body)
        if (!buildResult.success) {
          return NextResponse.json(
            { error: buildResult.error.issues[0].message },
            { status: 400 }
          )
        }
        validatedInput = buildResult.data
        break
      }
      case 'outbound': {
        const outboundResult = updateOutboundSchema.safeParse(body)
        if (!outboundResult.success) {
          return NextResponse.json(
            { error: outboundResult.error.issues[0].message },
            { status: 400 }
          )
        }
        validatedInput = outboundResult.data
        break
      }
      default:
        return NextResponse.json(
          { error: `Unsupported transaction type: ${existingTransaction.type}` },
          { status: 400 }
        )
    }

    // Call the update service
    const updated = await updateTransaction({
      transactionId: id,
      companyId: selectedCompanyId,
      userId: session.user.id,
      type: existingTransaction.type,
      input: validatedInput,
    })

    return NextResponse.json({ data: updated })
  } catch (error) {
    console.error('Error updating transaction:', error)
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 })
  }
}

// DELETE /api/transactions/[id] - Delete an approved transaction
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Mark request as used
  void request

  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check role - Viewer cannot delete transactions
    const companyRole = getSelectedCompanyRole(session)
    if (companyRole === 'viewer') {
      return NextResponse.json(
        { error: 'You do not have permission to delete transactions' },
        { status: 403 }
      )
    }

    const { id } = await params
    const selectedCompanyId = session.user.selectedCompanyId

    const result = await deleteTransaction({
      transactionId: id,
      companyId: selectedCompanyId,
      userId: session.user.id,
    })

    return NextResponse.json({ data: result })
  } catch (error) {
    console.error('Error deleting transaction:', error)
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 })
  }
}
