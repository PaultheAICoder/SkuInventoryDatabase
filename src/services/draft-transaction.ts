import { prisma } from '@/lib/db'
import { Prisma, TransactionStatus } from '@prisma/client'
import type { CreateDraftInput, DraftTransactionResponse, BatchApproveResult, BOMSnapshot, BOMLineSnapshot } from '@/types/draft'
import { checkInsufficientInventory, getComponentQuantities } from './inventory'
import { getDefaultLocationId } from './location'

// =============================================================================
// Transform Helpers
// =============================================================================

/**
 * Transform a Prisma transaction to DraftTransactionResponse
 */
function transformDraftTransaction(tx: Prisma.TransactionGetPayload<{
  include: {
    sku: { select: { id: true; name: true } }
    bomVersion: { select: { id: true; versionName: true } }
    location: { select: { id: true; name: true } }
    fromLocation: { select: { id: true; name: true } }
    toLocation: { select: { id: true; name: true } }
    createdBy: { select: { id: true; name: true } }
    reviewedBy: { select: { id: true; name: true } }
    lines: {
      include: {
        component: { select: { id: true; name: true; skuCode: true } }
        lot: { select: { id: true; lotNumber: true; expiryDate: true } }
      }
    }
  }
}>): DraftTransactionResponse {
  return {
    id: tx.id,
    type: tx.type as DraftTransactionResponse['type'],
    status: tx.status as DraftTransactionResponse['status'],
    date: tx.date.toISOString().split('T')[0],
    sku: tx.sku,
    bomVersion: tx.bomVersion,
    locationId: tx.locationId,
    location: tx.location,
    fromLocationId: tx.fromLocationId,
    fromLocation: tx.fromLocation,
    toLocationId: tx.toLocationId,
    toLocation: tx.toLocation,
    salesChannel: tx.salesChannel,
    unitsBuild: tx.unitsBuild,
    supplier: tx.supplier,
    reason: tx.reason,
    notes: tx.notes,
    rejectReason: tx.rejectReason,
    bomSnapshot: tx.bomSnapshot as BOMSnapshot | null,
    createdAt: tx.createdAt.toISOString(),
    createdBy: tx.createdBy,
    reviewedAt: tx.reviewedAt?.toISOString() ?? null,
    reviewedBy: tx.reviewedBy,
    lines: tx.lines.map((line) => ({
      id: line.id,
      component: line.component,
      quantityChange: line.quantityChange.toString(),
      costPerUnit: line.costPerUnit?.toString() ?? null,
      lotId: line.lotId ?? null,
      lot: line.lot
        ? {
            id: line.lot.id,
            lotNumber: line.lot.lotNumber,
            expiryDate: line.lot.expiryDate?.toISOString().split('T')[0] ?? null,
          }
        : null,
    })),
  }
}

// Standard include for draft queries
const draftInclude = {
  sku: { select: { id: true, name: true } },
  bomVersion: { select: { id: true, versionName: true } },
  location: { select: { id: true, name: true } },
  fromLocation: { select: { id: true, name: true } },
  toLocation: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
  lines: {
    include: {
      component: { select: { id: true, name: true, skuCode: true } },
      lot: { select: { id: true, lotNumber: true, expiryDate: true } },
    },
  },
}

// =============================================================================
// Create Draft Transaction
// =============================================================================

/**
 * Create a draft transaction (does NOT affect inventory)
 * Stores transaction data for review before applying to inventory
 */
export async function createDraftTransaction(params: {
  companyId: string
  createdById: string
  input: CreateDraftInput
}): Promise<DraftTransactionResponse> {
  const { companyId, createdById, input } = params

  // Resolve default location if not provided
  const locationIdToUse = input.locationId ?? await getDefaultLocationId(companyId)

  // For builds, get the active BOM version AND capture snapshot
  let bomVersionId: string | null = null
  let bomSnapshot: BOMSnapshot | null = null

  if (input.type === 'build' && input.skuId) {
    const sku = await prisma.sKU.findUnique({
      where: { id: input.skuId },
      include: {
        bomVersions: {
          where: { isActive: true },
          select: {
            id: true,
            versionName: true,
            lines: {
              include: {
                component: {
                  select: {
                    id: true,
                    name: true,
                    skuCode: true,
                    costPerUnit: true,
                  },
                },
              },
            },
          },
          take: 1,
        },
      },
    })

    if (sku?.bomVersions[0]) {
      const activeBom = sku.bomVersions[0]
      bomVersionId = activeBom.id

      // Capture BOM snapshot for approval-time integrity
      const snapshotLines: BOMLineSnapshot[] = activeBom.lines.map((line) => ({
        componentId: line.componentId,
        componentName: line.component.name,
        componentSkuCode: line.component.skuCode,
        quantityPerUnit: line.quantityPerUnit.toString(),
        costPerUnit: line.component.costPerUnit.toString(),
      }))

      bomSnapshot = {
        bomVersionId: activeBom.id,
        bomVersionName: activeBom.versionName,
        capturedAt: new Date().toISOString(),
        lines: snapshotLines,
      }
    }
  }

  // For receipt/adjustment/initial, get component info for the transaction line
  let componentCostPerUnit: number | null = null
  if (input.componentId && ['receipt', 'adjustment', 'initial'].includes(input.type)) {
    const component = await prisma.component.findUnique({
      where: { id: input.componentId },
      select: { costPerUnit: true },
    })
    componentCostPerUnit = input.costPerUnit ?? component?.costPerUnit.toNumber() ?? 0
  }

  // Create the draft transaction
  const transaction = await prisma.transaction.create({
    data: {
      companyId,
      type: input.type,
      status: 'draft', // Key difference - status is draft
      date: input.date,
      skuId: input.type === 'build' ? input.skuId : null,
      bomVersionId,
      bomSnapshot: bomSnapshot ? JSON.parse(JSON.stringify(bomSnapshot)) : null, // Store BOM snapshot as JSON
      locationId: locationIdToUse,
      fromLocationId: input.type === 'transfer' ? input.fromLocationId : null,
      toLocationId: input.type === 'transfer' ? input.toLocationId : null,
      salesChannel: input.salesChannel ?? null,
      unitsBuild: input.type === 'build' ? input.unitsToBuild : null,
      supplier: input.supplier ?? null,
      reason: input.reason ?? null,
      notes: input.notes ?? null,
      defectCount: input.defectCount ?? null,
      defectNotes: input.defectNotes ?? null,
      affectedUnits: input.affectedUnits ?? null,
      createdById,
      // Create placeholder transaction lines for non-build types
      ...(input.componentId && input.quantity !== undefined && input.type !== 'build'
        ? {
            lines: {
              create: {
                componentId: input.componentId,
                // For drafts, we store the intended quantity but don't apply it to inventory
                quantityChange: input.type === 'transfer'
                  ? new Prisma.Decimal(-1 * Math.abs(input.quantity)) // Transfer outgoing
                  : input.type === 'adjustment'
                    ? new Prisma.Decimal(input.quantity) // Adjustment can be positive or negative
                    : new Prisma.Decimal(Math.abs(input.quantity)), // Receipt/initial are positive
                costPerUnit: componentCostPerUnit !== null ? new Prisma.Decimal(componentCostPerUnit) : null,
              },
            },
          }
        : {}),
    },
    include: draftInclude,
  })

  return transformDraftTransaction(transaction)
}

// =============================================================================
// Get Draft Transactions
// =============================================================================

/**
 * List draft transactions for a company with pagination and filtering
 */
export async function getDraftTransactions(params: {
  companyId: string
  page?: number
  pageSize?: number
  type?: string
  status?: TransactionStatus
  sortBy?: 'date' | 'createdAt' | 'type'
  sortOrder?: 'asc' | 'desc'
}): Promise<{ data: DraftTransactionResponse[]; total: number }> {
  const {
    companyId,
    page = 1,
    pageSize = 20,
    type,
    status = 'draft', // Default to showing pending drafts
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = params

  const where: Prisma.TransactionWhereInput = {
    companyId,
    status,
    ...(type && { type: type as Prisma.TransactionWhereInput['type'] }),
  }

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { [sortBy]: sortOrder },
      include: draftInclude,
    }),
    prisma.transaction.count({ where }),
  ])

  return {
    data: transactions.map(transformDraftTransaction),
    total,
  }
}

/**
 * Get a single draft transaction by ID
 */
export async function getDraftTransaction(params: {
  id: string
  companyId: string
}): Promise<DraftTransactionResponse | null> {
  const { id, companyId } = params

  const transaction = await prisma.transaction.findFirst({
    where: {
      id,
      companyId,
    },
    include: draftInclude,
  })

  if (!transaction) {
    return null
  }

  return transformDraftTransaction(transaction)
}

/**
 * Get count of pending drafts for a company (for nav badge)
 */
export async function getDraftCount(companyId: string): Promise<number> {
  return prisma.transaction.count({
    where: {
      companyId,
      status: 'draft',
    },
  })
}

// =============================================================================
// Update Draft Transaction
// =============================================================================

/**
 * Update a draft transaction (only if still in draft status)
 */
export async function updateDraftTransaction(params: {
  id: string
  companyId: string
  input: Partial<CreateDraftInput>
}): Promise<DraftTransactionResponse> {
  const { id, companyId, input } = params

  // First verify the draft exists and is still in draft status
  const existing = await prisma.transaction.findFirst({
    where: {
      id,
      companyId,
      status: 'draft',
    },
  })

  if (!existing) {
    throw new Error('Draft transaction not found or already processed')
  }

  // Build update data
  const updateData: Prisma.TransactionUpdateInput = {}

  if (input.date !== undefined) updateData.date = input.date
  if (input.notes !== undefined) updateData.notes = input.notes
  if (input.supplier !== undefined) updateData.supplier = input.supplier
  if (input.reason !== undefined) updateData.reason = input.reason
  if (input.salesChannel !== undefined) updateData.salesChannel = input.salesChannel
  if (input.unitsToBuild !== undefined) updateData.unitsBuild = input.unitsToBuild
  if (input.locationId !== undefined) updateData.location = { connect: { id: input.locationId } }
  if (input.fromLocationId !== undefined) updateData.fromLocation = { connect: { id: input.fromLocationId } }
  if (input.toLocationId !== undefined) updateData.toLocation = { connect: { id: input.toLocationId } }
  if (input.defectCount !== undefined) updateData.defectCount = input.defectCount
  if (input.defectNotes !== undefined) updateData.defectNotes = input.defectNotes
  if (input.affectedUnits !== undefined) updateData.affectedUnits = input.affectedUnits

  const updated = await prisma.transaction.update({
    where: { id },
    data: updateData,
    include: draftInclude,
  })

  return transformDraftTransaction(updated)
}

// =============================================================================
// Delete Draft Transaction
// =============================================================================

/**
 * Delete a draft transaction (only if still in draft status)
 */
export async function deleteDraftTransaction(params: {
  id: string
  companyId: string
}): Promise<void> {
  const { id, companyId } = params

  // Verify the draft exists and is still in draft status
  const existing = await prisma.transaction.findFirst({
    where: {
      id,
      companyId,
      status: 'draft',
    },
  })

  if (!existing) {
    throw new Error('Draft transaction not found or already processed')
  }

  // Delete the transaction (cascade will delete lines)
  await prisma.transaction.delete({
    where: { id },
  })
}

// =============================================================================
// Approve Draft Transaction
// =============================================================================

/**
 * Approve a draft transaction - creates the actual inventory impact
 * Re-validates inventory availability before applying
 */
export async function approveDraftTransaction(params: {
  id: string
  companyId: string
  reviewedById: string
}): Promise<{ success: boolean; transaction?: DraftTransactionResponse; error?: string }> {
  const { id, companyId, reviewedById } = params

  // Get the draft with all details
  const draft = await prisma.transaction.findFirst({
    where: {
      id,
      companyId,
      status: 'draft',
    },
    include: {
      ...draftInclude,
      lines: {
        include: {
          component: true,
          lot: true,
        },
      },
    },
  })

  if (!draft) {
    return { success: false, error: 'Draft transaction not found or already processed' }
  }

  try {
    // Use a Prisma transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Get BOM snapshot if available (for build transactions)
      const bomSnapshot = draft.bomSnapshot as BOMSnapshot | null

      // For build transactions, re-validate inventory availability INSIDE transaction
      // This prevents race conditions where inventory could become insufficient after check but before approval
      if (draft.type === 'build' && draft.bomVersionId && draft.unitsBuild) {
        // Use snapshot component IDs if available, otherwise fall back to current BOM
        if (bomSnapshot && bomSnapshot.lines.length > 0) {
          // Check inventory for snapshot components
          const componentIds = bomSnapshot.lines.map(l => l.componentId)
          const quantities = await getComponentQuantities(
            componentIds,
            companyId,
            draft.locationId ?? undefined
          )

          const insufficientItems: Array<{ componentName: string }> = []
          for (const line of bomSnapshot.lines) {
            const available = quantities.get(line.componentId) ?? 0
            const required = parseFloat(line.quantityPerUnit) * draft.unitsBuild
            if (available < required) {
              insufficientItems.push({ componentName: line.componentName })
            }
          }

          if (insufficientItems.length > 0) {
            throw new Error(
              `Insufficient inventory for: ${insufficientItems.map((i) => i.componentName).join(', ')}`
            )
          }
        } else {
          // Fallback to existing checkInsufficientInventory for legacy drafts
          const insufficientItems = await checkInsufficientInventory({
            bomVersionId: draft.bomVersionId,
            companyId,
            unitsToBuild: draft.unitsBuild,
            locationId: draft.locationId ?? undefined,
          })

          if (insufficientItems.length > 0) {
            throw new Error(
              `Insufficient inventory for: ${insufficientItems.map((i) => i.componentName).join(', ')}`
            )
          }
        }
      }

      // Mark the draft as approved first
      const approvedDraft = await tx.transaction.update({
        where: { id },
        data: {
          status: 'approved',
          reviewedAt: new Date(),
          reviewedById,
        },
        include: draftInclude,
      })

      // Now create the actual inventory impact based on transaction type
      // We need to either update the existing transaction lines or create new ones

      if (draft.type === 'build' && draft.skuId && draft.bomVersionId && draft.unitsBuild) {
        // For builds, we need to create the consumption lines
        // Delete placeholder lines if any
        await tx.transactionLine.deleteMany({
          where: { transactionId: id },
        })

        // Use the BOM snapshot captured at draft creation time
        // This ensures we consume exactly what the draft creator/reviewer saw
        if (!bomSnapshot || !bomSnapshot.lines || bomSnapshot.lines.length === 0) {
          // Fallback to current BOM if no snapshot exists (legacy drafts)
          // This maintains backward compatibility
          console.warn(`Draft ${id} has no BOM snapshot, falling back to current BOM`)
          const bomLines = await tx.bOMLine.findMany({
            where: { bomVersionId: draft.bomVersionId },
            include: {
              component: { select: { id: true, costPerUnit: true } },
            },
          })

          for (const bomLine of bomLines) {
            const requiredQty = bomLine.quantityPerUnit.toNumber() * draft.unitsBuild

            await tx.transactionLine.create({
              data: {
                transactionId: id,
                componentId: bomLine.componentId,
                quantityChange: new Prisma.Decimal(-1 * requiredQty),
                costPerUnit: bomLine.component.costPerUnit,
              },
            })
          }

          const unitBomCost = bomLines.reduce((total, line) => {
            return total + line.quantityPerUnit.toNumber() * line.component.costPerUnit.toNumber()
          }, 0)

          await tx.transaction.update({
            where: { id },
            data: {
              unitBomCost: new Prisma.Decimal(unitBomCost),
              totalBomCost: new Prisma.Decimal(unitBomCost * draft.unitsBuild),
            },
          })

          // Create finished goods output
          const defaultLocationId = await getDefaultLocationId(companyId)
          await tx.finishedGoodsLine.create({
            data: {
              transactionId: id,
              skuId: draft.skuId,
              locationId: draft.locationId ?? defaultLocationId ?? '',
              quantityChange: new Prisma.Decimal(draft.unitsBuild),
              costPerUnit: new Prisma.Decimal(unitBomCost),
            },
          })
        } else {
          // Use snapshot data for consumption
          for (const line of bomSnapshot.lines) {
            const requiredQty = parseFloat(line.quantityPerUnit) * draft.unitsBuild

            await tx.transactionLine.create({
              data: {
                transactionId: id,
                componentId: line.componentId,
                quantityChange: new Prisma.Decimal(-1 * requiredQty),
                costPerUnit: new Prisma.Decimal(line.costPerUnit),
              },
            })
          }

          // Calculate costs from snapshot
          const unitBomCost = bomSnapshot.lines.reduce((total, line) => {
            return total + parseFloat(line.quantityPerUnit) * parseFloat(line.costPerUnit)
          }, 0)

          await tx.transaction.update({
            where: { id },
            data: {
              unitBomCost: new Prisma.Decimal(unitBomCost),
              totalBomCost: new Prisma.Decimal(unitBomCost * draft.unitsBuild),
            },
          })

          // Create finished goods output (using snapshot cost)
          const defaultLocationId = await getDefaultLocationId(companyId)
          await tx.finishedGoodsLine.create({
            data: {
              transactionId: id,
              skuId: draft.skuId,
              locationId: draft.locationId ?? defaultLocationId ?? '',
              quantityChange: new Prisma.Decimal(draft.unitsBuild),
              costPerUnit: new Prisma.Decimal(unitBomCost),
            },
          })
        }
      } else if (draft.type === 'transfer' && draft.lines.length > 0) {
        // For transfers, create both outgoing and incoming lines
        const originalLine = draft.lines[0]
        const quantity = Math.abs(originalLine.quantityChange.toNumber())

        // Delete original line
        await tx.transactionLine.deleteMany({
          where: { transactionId: id },
        })

        // Create outgoing line (negative from source)
        await tx.transactionLine.create({
          data: {
            transactionId: id,
            componentId: originalLine.componentId,
            quantityChange: new Prisma.Decimal(-1 * quantity),
            costPerUnit: originalLine.costPerUnit,
          },
        })

        // Create incoming line (positive to destination)
        await tx.transactionLine.create({
          data: {
            transactionId: id,
            componentId: originalLine.componentId,
            quantityChange: new Prisma.Decimal(quantity),
            costPerUnit: originalLine.costPerUnit,
          },
        })
      }
      // For receipt, adjustment, initial - the lines are already correct from draft creation

      return approvedDraft
    })

    return {
      success: true,
      transaction: transformDraftTransaction(result),
    }
  } catch (error) {
    console.error('Error approving draft:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to approve draft',
    }
  }
}

// =============================================================================
// Reject Draft Transaction
// =============================================================================

/**
 * Reject a draft transaction
 */
export async function rejectDraftTransaction(params: {
  id: string
  companyId: string
  reviewedById: string
  reason?: string
}): Promise<DraftTransactionResponse> {
  const { id, companyId, reviewedById, reason } = params

  // Verify the draft exists and is still in draft status
  const existing = await prisma.transaction.findFirst({
    where: {
      id,
      companyId,
      status: 'draft',
    },
  })

  if (!existing) {
    throw new Error('Draft transaction not found or already processed')
  }

  const rejected = await prisma.transaction.update({
    where: { id },
    data: {
      status: 'rejected',
      reviewedAt: new Date(),
      reviewedById,
      rejectReason: reason ?? null,
    },
    include: draftInclude,
  })

  return transformDraftTransaction(rejected)
}

// =============================================================================
// Batch Approve Drafts
// =============================================================================

/**
 * Batch approve multiple draft transactions
 */
export async function batchApproveDrafts(params: {
  draftIds: string[]
  companyId: string
  reviewedById: string
}): Promise<BatchApproveResult> {
  const { draftIds, companyId, reviewedById } = params

  const results: BatchApproveResult['results'] = []

  for (const draftId of draftIds) {
    const result = await approveDraftTransaction({
      id: draftId,
      companyId,
      reviewedById,
    })

    results.push({
      id: draftId,
      success: result.success,
      error: result.error,
    })
  }

  return {
    total: draftIds.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  }
}
