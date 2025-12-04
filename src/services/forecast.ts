import { prisma } from '@/lib/db'
import { TransactionType } from '@prisma/client'
import { getComponentQuantities } from './inventory'
import {
  ComponentForecast,
  ForecastConfigInput,
  DEFAULT_FORECAST_CONFIG,
  ForecastAssumptions,
  ExcludableTransactionType,
} from '@/types/forecast'

/**
 * Get forecast configuration for a company, returning defaults if none exists
 */
export async function getForecastConfig(companyId: string): Promise<ForecastConfigInput> {
  const config = await prisma.forecastConfig.findUnique({
    where: { companyId },
  })
  if (config) {
    return {
      lookbackDays: config.lookbackDays,
      safetyDays: config.safetyDays,
      excludedTransactionTypes: config.excludedTransactionTypes as ExcludableTransactionType[],
    }
  }
  return DEFAULT_FORECAST_CONFIG
}

/**
 * Upsert (create or update) forecast configuration for a company
 */
export async function upsertForecastConfig(
  companyId: string,
  input: Partial<ForecastConfigInput>
): Promise<ForecastConfigInput> {
  const config = await prisma.forecastConfig.upsert({
    where: { companyId },
    create: {
      companyId,
      lookbackDays: input.lookbackDays ?? DEFAULT_FORECAST_CONFIG.lookbackDays,
      safetyDays: input.safetyDays ?? DEFAULT_FORECAST_CONFIG.safetyDays,
      excludedTransactionTypes:
        input.excludedTransactionTypes ?? DEFAULT_FORECAST_CONFIG.excludedTransactionTypes,
    },
    update: {
      ...(input.lookbackDays !== undefined && { lookbackDays: input.lookbackDays }),
      ...(input.safetyDays !== undefined && { safetyDays: input.safetyDays }),
      ...(input.excludedTransactionTypes !== undefined && {
        excludedTransactionTypes: input.excludedTransactionTypes,
      }),
    },
  })

  return {
    lookbackDays: config.lookbackDays,
    safetyDays: config.safetyDays,
    excludedTransactionTypes: config.excludedTransactionTypes as ExcludableTransactionType[],
  }
}

/**
 * Calculate consumption rate (average daily usage) for a single component
 * Returns the average daily consumption based on transaction history
 */
export async function calculateConsumptionRate(
  componentId: string,
  lookbackDays: number = 30,
  excludedTypes: string[] = ['initial', 'adjustment']
): Promise<number> {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - lookbackDays)

  const result = await prisma.transactionLine.aggregate({
    where: {
      componentId,
      quantityChange: { lt: 0 }, // Only consumption (negative)
      transaction: {
        status: 'approved',
        type: { notIn: excludedTypes as TransactionType[] },
        createdAt: { gte: startDate },
      },
    },
    _sum: { quantityChange: true },
  })

  const totalConsumed = Math.abs(result._sum.quantityChange?.toNumber() ?? 0)
  return totalConsumed / lookbackDays
}

/**
 * Calculate consumption rates for multiple components at once (batch version)
 * Returns a Map of componentId -> average daily consumption
 */
export async function calculateConsumptionRates(
  componentIds: string[],
  lookbackDays: number = 30,
  excludedTypes: string[] = ['initial', 'adjustment']
): Promise<Map<string, number>> {
  if (componentIds.length === 0) {
    return new Map()
  }

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - lookbackDays)

  const results = await prisma.transactionLine.groupBy({
    by: ['componentId'],
    where: {
      componentId: { in: componentIds },
      quantityChange: { lt: 0 },
      transaction: {
        status: 'approved',
        type: { notIn: excludedTypes as TransactionType[] },
        createdAt: { gte: startDate },
      },
    },
    _sum: { quantityChange: true },
  })

  const consumptionRates = new Map<string, number>()

  // Initialize all to 0
  for (const id of componentIds) {
    consumptionRates.set(id, 0)
  }

  // Calculate daily rates
  for (const result of results) {
    const totalConsumed = Math.abs(result._sum.quantityChange?.toNumber() ?? 0)
    consumptionRates.set(result.componentId, totalConsumed / lookbackDays)
  }

  return consumptionRates
}

/**
 * Calculate runout date based on quantity on hand and daily consumption
 * Pure function - no database access needed
 */
export function calculateRunoutDate(
  quantityOnHand: number,
  dailyConsumption: number
): { daysUntilRunout: number | null; runoutDate: Date | null } {
  // Handle zero or negative consumption (infinite runway)
  if (dailyConsumption <= 0) {
    return { daysUntilRunout: null, runoutDate: null }
  }

  // Handle zero or negative on-hand (already out)
  if (quantityOnHand <= 0) {
    return { daysUntilRunout: 0, runoutDate: new Date() }
  }

  const daysUntilRunout = Math.floor(quantityOnHand / dailyConsumption)
  const runoutDate = new Date()
  runoutDate.setDate(runoutDate.getDate() + daysUntilRunout)

  return { daysUntilRunout, runoutDate }
}

/**
 * Calculate reorder recommendation based on consumption rate and lead time
 * Pure function - no database access needed
 */
export function calculateReorderRecommendation(params: {
  dailyConsumption: number
  leadTimeDays: number
  safetyDays: number
  runoutDate: Date | null
}): { recommendedReorderQty: number; recommendedReorderDate: Date | null } {
  const { dailyConsumption, leadTimeDays, safetyDays, runoutDate } = params

  // Handle zero consumption
  if (dailyConsumption <= 0) {
    return { recommendedReorderQty: 0, recommendedReorderDate: null }
  }

  // Calculate reorder quantity: (leadTime + safety) * daily consumption
  const recommendedReorderQty = Math.ceil((leadTimeDays + safetyDays) * dailyConsumption)

  // Calculate reorder date: runoutDate - leadTimeDays
  let recommendedReorderDate: Date | null = null
  if (runoutDate) {
    recommendedReorderDate = new Date(runoutDate)
    recommendedReorderDate.setDate(recommendedReorderDate.getDate() - leadTimeDays)

    // If reorder date is in the past, set to today
    if (recommendedReorderDate < new Date()) {
      recommendedReorderDate = new Date()
    }
  }

  return { recommendedReorderQty, recommendedReorderDate }
}

/**
 * Get forecasts for all active components in a company
 */
export async function getComponentForecasts(
  companyId: string,
  configOverride?: Partial<ForecastConfigInput>
): Promise<ComponentForecast[]> {
  // Get config (with overrides)
  const baseConfig = await getForecastConfig(companyId)
  const config: ForecastConfigInput = {
    ...baseConfig,
    ...configOverride,
  }

  const assumptions: ForecastAssumptions = {
    lookbackDays: config.lookbackDays,
    safetyDays: config.safetyDays,
    excludedTransactionTypes: config.excludedTransactionTypes,
  }

  // Get all active components for company
  const components = await prisma.component.findMany({
    where: {
      companyId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      skuCode: true,
      leadTimeDays: true,
    },
  })

  if (components.length === 0) {
    return []
  }

  const componentIds = components.map((c) => c.id)

  // Batch fetch quantities and consumption rates
  const [quantities, consumptionRates] = await Promise.all([
    getComponentQuantities(componentIds),
    calculateConsumptionRates(componentIds, config.lookbackDays, config.excludedTransactionTypes),
  ])

  // Build forecasts for each component
  const forecasts: ComponentForecast[] = []

  for (const component of components) {
    const quantityOnHand = quantities.get(component.id) ?? 0
    const averageDailyConsumption = consumptionRates.get(component.id) ?? 0

    const { daysUntilRunout, runoutDate } = calculateRunoutDate(
      quantityOnHand,
      averageDailyConsumption
    )

    const { recommendedReorderQty, recommendedReorderDate } = calculateReorderRecommendation({
      dailyConsumption: averageDailyConsumption,
      leadTimeDays: component.leadTimeDays,
      safetyDays: config.safetyDays,
      runoutDate,
    })

    forecasts.push({
      componentId: component.id,
      componentName: component.name,
      skuCode: component.skuCode,
      quantityOnHand,
      averageDailyConsumption,
      daysUntilRunout,
      runoutDate,
      recommendedReorderQty,
      recommendedReorderDate,
      leadTimeDays: component.leadTimeDays,
      assumptions,
    })
  }

  return forecasts
}

/**
 * Get forecast for a single component by ID
 */
export async function getComponentForecastById(
  componentId: string,
  configOverride?: Partial<ForecastConfigInput>
): Promise<ComponentForecast | null> {
  // Get component with company info
  const component = await prisma.component.findUnique({
    where: { id: componentId },
    select: {
      id: true,
      name: true,
      skuCode: true,
      leadTimeDays: true,
      companyId: true,
      isActive: true,
    },
  })

  if (!component || !component.isActive || !component.companyId) {
    return null
  }

  // Get config (with overrides)
  const baseConfig = await getForecastConfig(component.companyId)
  const config: ForecastConfigInput = {
    ...baseConfig,
    ...configOverride,
  }

  const assumptions: ForecastAssumptions = {
    lookbackDays: config.lookbackDays,
    safetyDays: config.safetyDays,
    excludedTransactionTypes: config.excludedTransactionTypes,
  }

  // Calculate consumption rate
  const averageDailyConsumption = await calculateConsumptionRate(
    componentId,
    config.lookbackDays,
    config.excludedTransactionTypes
  )

  // Get quantity on hand
  const quantities = await getComponentQuantities([componentId])
  const quantityOnHand = quantities.get(componentId) ?? 0

  // Calculate runout
  const { daysUntilRunout, runoutDate } = calculateRunoutDate(
    quantityOnHand,
    averageDailyConsumption
  )

  // Calculate reorder recommendation
  const { recommendedReorderQty, recommendedReorderDate } = calculateReorderRecommendation({
    dailyConsumption: averageDailyConsumption,
    leadTimeDays: component.leadTimeDays,
    safetyDays: config.safetyDays,
    runoutDate,
  })

  return {
    componentId: component.id,
    componentName: component.name,
    skuCode: component.skuCode,
    quantityOnHand,
    averageDailyConsumption,
    daysUntilRunout,
    runoutDate,
    recommendedReorderQty,
    recommendedReorderDate,
    leadTimeDays: component.leadTimeDays,
    assumptions,
  }
}
