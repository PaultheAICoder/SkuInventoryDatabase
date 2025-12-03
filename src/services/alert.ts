import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { getCompanySettings } from './inventory'
import type {
  CreateThresholdInput,
  UpdateThresholdInput,
  AlertQuery,
  DefectThresholdResponse,
  DefectAlertResponse,
} from '@/types/alert'

/**
 * Evaluate if a defect rate exceeds the configured threshold
 * Creates an alert if threshold is exceeded
 */
export async function evaluateDefectThreshold(params: {
  transactionId: string
  skuId: string
  defectRate: number
  companyId: string
  unitsBuild: number
  defectCount: number
}): Promise<{ id: string } | null> {
  const { transactionId, skuId, defectRate, companyId } = params

  // Check if defect alerts are enabled
  const settings = await getCompanySettings(companyId)
  if (!settings.enableDefectAlerts) return null

  // Get applicable threshold (SKU-specific first, then global)
  const threshold = await prisma.defectThreshold.findFirst({
    where: {
      companyId,
      isActive: true,
      OR: [{ skuId }, { skuId: null }], // SKU-specific or global
    },
    orderBy: { skuId: 'desc' }, // SKU-specific (not null) comes before global (null)
  })

  if (!threshold) return null

  const thresholdValue = threshold.defectRateLimit.toNumber()
  if (defectRate <= thresholdValue) return null

  // Determine severity based on company settings
  const severity =
    defectRate >= settings.defectRateCriticalThreshold ? 'critical' : 'warning'

  // Create alert
  const alert = await prisma.defectAlert.create({
    data: {
      thresholdId: threshold.id,
      transactionId,
      skuId,
      defectRate: new Prisma.Decimal(defectRate),
      thresholdValue: threshold.defectRateLimit,
      severity,
    },
  })

  return { id: alert.id }
}

/**
 * Get all defect thresholds for a company
 */
export async function getDefectThresholds(
  companyId: string
): Promise<DefectThresholdResponse[]> {
  const thresholds = await prisma.defectThreshold.findMany({
    where: { companyId },
    include: {
      sku: {
        select: { id: true, name: true, internalCode: true },
      },
      createdBy: {
        select: { id: true, name: true },
      },
    },
    orderBy: [{ skuId: 'asc' }, { createdAt: 'desc' }],
  })

  return thresholds.map((t) => ({
    id: t.id,
    companyId: t.companyId,
    skuId: t.skuId,
    skuName: t.sku?.name ?? null,
    skuCode: t.sku?.internalCode ?? null,
    defectRateLimit: t.defectRateLimit.toNumber(),
    affectedRateLimit: t.affectedRateLimit?.toNumber() ?? null,
    isActive: t.isActive,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    createdBy: t.createdBy,
  }))
}

/**
 * Get defect alerts for a company with optional filters
 */
export async function getDefectAlerts(
  companyId: string,
  query: AlertQuery
): Promise<DefectAlertResponse[]> {
  const { skuId, acknowledged, severity, limit } = query

  const where: Prisma.DefectAlertWhereInput = {
    threshold: { companyId },
    ...(skuId && { skuId }),
    ...(acknowledged === 'true' && { acknowledgedAt: { not: null } }),
    ...(acknowledged === 'false' && { acknowledgedAt: null }),
    ...(severity !== 'all' && { severity }),
  }

  const alerts = await prisma.defectAlert.findMany({
    where,
    include: {
      sku: {
        select: { id: true, name: true, internalCode: true },
      },
      transaction: {
        select: { id: true, date: true, unitsBuild: true, defectCount: true },
      },
      acknowledgedBy: {
        select: { id: true, name: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return alerts.map((a) => ({
    id: a.id,
    thresholdId: a.thresholdId,
    transactionId: a.transactionId,
    skuId: a.skuId,
    skuName: a.sku.name,
    skuCode: a.sku.internalCode,
    defectRate: a.defectRate.toNumber(),
    thresholdValue: a.thresholdValue.toNumber(),
    severity: a.severity as 'warning' | 'critical',
    acknowledgedAt: a.acknowledgedAt?.toISOString() ?? null,
    acknowledgedBy: a.acknowledgedBy,
    createdAt: a.createdAt.toISOString(),
    transaction: {
      id: a.transaction.id,
      date: a.transaction.date.toISOString().split('T')[0],
      unitsBuild: a.transaction.unitsBuild ?? 0,
      defectCount: a.transaction.defectCount ?? 0,
    },
  }))
}

/**
 * Acknowledge one or more alerts
 */
export async function acknowledgeAlerts(
  alertIds: string[],
  userId: string
): Promise<{ count: number }> {
  const result = await prisma.defectAlert.updateMany({
    where: {
      id: { in: alertIds },
      acknowledgedAt: null,
    },
    data: {
      acknowledgedAt: new Date(),
      acknowledgedById: userId,
    },
  })

  return { count: result.count }
}

/**
 * Create a new defect threshold
 */
export async function createThreshold(
  companyId: string,
  input: CreateThresholdInput,
  userId: string
): Promise<DefectThresholdResponse> {
  const threshold = await prisma.defectThreshold.create({
    data: {
      companyId,
      skuId: input.skuId ?? null,
      defectRateLimit: new Prisma.Decimal(input.defectRateLimit),
      affectedRateLimit: input.affectedRateLimit
        ? new Prisma.Decimal(input.affectedRateLimit)
        : null,
      isActive: input.isActive ?? true,
      createdById: userId,
    },
    include: {
      sku: {
        select: { id: true, name: true, internalCode: true },
      },
      createdBy: {
        select: { id: true, name: true },
      },
    },
  })

  return {
    id: threshold.id,
    companyId: threshold.companyId,
    skuId: threshold.skuId,
    skuName: threshold.sku?.name ?? null,
    skuCode: threshold.sku?.internalCode ?? null,
    defectRateLimit: threshold.defectRateLimit.toNumber(),
    affectedRateLimit: threshold.affectedRateLimit?.toNumber() ?? null,
    isActive: threshold.isActive,
    createdAt: threshold.createdAt.toISOString(),
    updatedAt: threshold.updatedAt.toISOString(),
    createdBy: threshold.createdBy,
  }
}

/**
 * Update an existing threshold
 */
export async function updateThreshold(
  thresholdId: string,
  input: UpdateThresholdInput,
  _userId: string
): Promise<DefectThresholdResponse> {
  const data: Prisma.DefectThresholdUpdateInput = {}

  if (input.skuId !== undefined) {
    data.sku = input.skuId ? { connect: { id: input.skuId } } : { disconnect: true }
  }
  if (input.defectRateLimit !== undefined) {
    data.defectRateLimit = new Prisma.Decimal(input.defectRateLimit)
  }
  if (input.affectedRateLimit !== undefined) {
    data.affectedRateLimit = input.affectedRateLimit
      ? new Prisma.Decimal(input.affectedRateLimit)
      : null
  }
  if (input.isActive !== undefined) {
    data.isActive = input.isActive
  }

  const threshold = await prisma.defectThreshold.update({
    where: { id: thresholdId },
    data,
    include: {
      sku: {
        select: { id: true, name: true, internalCode: true },
      },
      createdBy: {
        select: { id: true, name: true },
      },
    },
  })

  return {
    id: threshold.id,
    companyId: threshold.companyId,
    skuId: threshold.skuId,
    skuName: threshold.sku?.name ?? null,
    skuCode: threshold.sku?.internalCode ?? null,
    defectRateLimit: threshold.defectRateLimit.toNumber(),
    affectedRateLimit: threshold.affectedRateLimit?.toNumber() ?? null,
    isActive: threshold.isActive,
    createdAt: threshold.createdAt.toISOString(),
    updatedAt: threshold.updatedAt.toISOString(),
    createdBy: threshold.createdBy,
  }
}

/**
 * Delete a threshold
 */
export async function deleteThreshold(thresholdId: string): Promise<void> {
  // First, delete all related alerts
  await prisma.defectAlert.deleteMany({
    where: { thresholdId },
  })

  // Then delete the threshold
  await prisma.defectThreshold.delete({
    where: { id: thresholdId },
  })
}

/**
 * Get a single alert by ID
 */
export async function getAlertById(
  alertId: string
): Promise<DefectAlertResponse | null> {
  const alert = await prisma.defectAlert.findUnique({
    where: { id: alertId },
    include: {
      sku: {
        select: { id: true, name: true, internalCode: true },
      },
      transaction: {
        select: { id: true, date: true, unitsBuild: true, defectCount: true },
      },
      acknowledgedBy: {
        select: { id: true, name: true },
      },
    },
  })

  if (!alert) return null

  return {
    id: alert.id,
    thresholdId: alert.thresholdId,
    transactionId: alert.transactionId,
    skuId: alert.skuId,
    skuName: alert.sku.name,
    skuCode: alert.sku.internalCode,
    defectRate: alert.defectRate.toNumber(),
    thresholdValue: alert.thresholdValue.toNumber(),
    severity: alert.severity as 'warning' | 'critical',
    acknowledgedAt: alert.acknowledgedAt?.toISOString() ?? null,
    acknowledgedBy: alert.acknowledgedBy,
    createdAt: alert.createdAt.toISOString(),
    transaction: {
      id: alert.transaction.id,
      date: alert.transaction.date.toISOString().split('T')[0],
      unitsBuild: alert.transaction.unitsBuild ?? 0,
      defectCount: alert.transaction.defectCount ?? 0,
    },
  }
}

/**
 * Get count of unacknowledged alerts for a company
 */
export async function getUnacknowledgedAlertCount(
  companyId: string
): Promise<number> {
  return prisma.defectAlert.count({
    where: {
      threshold: { companyId },
      acknowledgedAt: null,
    },
  })
}
