import { prisma } from '@/lib/db'
import {
  getComponentQuantities,
  calculateReorderStatus,
  getCompanySettings,
} from './inventory'
import {
  sendSlackMessage,
  formatLowStockAlert,
  formatDigestMessage,
  type LowStockAlertData,
} from '@/lib/slack'
import type { ReorderStatus } from '@/types'
import type {
  AlertConfigResponse,
  ComponentAlertNeeded,
  LowStockAlertEvaluation,
  AlertTransition,
} from '@/types/lowstock-alert'

/**
 * Determine the type of state transition
 */
function getTransition(
  previousStatus: ReorderStatus,
  currentStatus: ReorderStatus
): AlertTransition {
  if (previousStatus === currentStatus) return 'no_change'

  const key = `${previousStatus}_to_${currentStatus}` as AlertTransition
  return key
}

/**
 * Check if a transition should trigger an alert
 * Only alert on transitions TO warning or critical
 */
function shouldAlert(transition: AlertTransition): boolean {
  return [
    'ok_to_warning',
    'ok_to_critical',
    'warning_to_critical',
  ].includes(transition)
}

/**
 * Check if a transition is a recovery (back to OK)
 */
function isRecovery(transition: AlertTransition): boolean {
  return [
    'warning_to_ok',
    'critical_to_ok',
  ].includes(transition)
}

/**
 * Get or create alert config for a company
 */
export async function getAlertConfig(
  companyId: string
): Promise<AlertConfigResponse | null> {
  const config = await prisma.alertConfig.findUnique({
    where: { companyId },
  })

  if (!config) return null

  return {
    id: config.id,
    companyId: config.companyId,
    slackWebhookUrl: config.slackWebhookUrl,
    emailAddresses: config.emailAddresses,
    enableSlack: config.enableSlack,
    enableEmail: config.enableEmail,
    alertMode: config.alertMode as 'daily_digest' | 'per_transition',
    lastDigestSent: config.lastDigestSent?.toISOString() ?? null,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  }
}

/**
 * Create or update alert config for a company
 */
export async function upsertAlertConfig(
  companyId: string,
  input: {
    slackWebhookUrl?: string | null
    emailAddresses?: string[]
    enableSlack?: boolean
    enableEmail?: boolean
    alertMode?: 'daily_digest' | 'per_transition'
  }
): Promise<AlertConfigResponse> {
  const config = await prisma.alertConfig.upsert({
    where: { companyId },
    create: {
      companyId,
      slackWebhookUrl: input.slackWebhookUrl ?? null,
      emailAddresses: input.emailAddresses ?? [],
      enableSlack: input.enableSlack ?? false,
      enableEmail: input.enableEmail ?? false,
      alertMode: input.alertMode ?? 'daily_digest',
    },
    update: {
      ...(input.slackWebhookUrl !== undefined && { slackWebhookUrl: input.slackWebhookUrl }),
      ...(input.emailAddresses !== undefined && { emailAddresses: input.emailAddresses }),
      ...(input.enableSlack !== undefined && { enableSlack: input.enableSlack }),
      ...(input.enableEmail !== undefined && { enableEmail: input.enableEmail }),
      ...(input.alertMode !== undefined && { alertMode: input.alertMode }),
    },
  })

  return {
    id: config.id,
    companyId: config.companyId,
    slackWebhookUrl: config.slackWebhookUrl,
    emailAddresses: config.emailAddresses,
    enableSlack: config.enableSlack,
    enableEmail: config.enableEmail,
    alertMode: config.alertMode as 'daily_digest' | 'per_transition',
    lastDigestSent: config.lastDigestSent?.toISOString() ?? null,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  }
}

/**
 * Update last digest sent timestamp
 */
export async function updateLastDigestSent(companyId: string): Promise<void> {
  await prisma.alertConfig.update({
    where: { companyId },
    data: { lastDigestSent: new Date() },
  })
}

/**
 * Update component alert state after evaluation
 */
async function updateComponentAlertState(
  componentId: string,
  status: ReorderStatus,
  alertSent: boolean
): Promise<void> {
  await prisma.componentAlertState.upsert({
    where: { componentId },
    create: {
      componentId,
      lastStatus: status,
      lastAlertSent: alertSent ? new Date() : null,
    },
    update: {
      lastStatus: status,
      ...(alertSent && { lastAlertSent: new Date() }),
    },
  })
}

/**
 * Main evaluation function - detects state transitions for components
 *
 * This function:
 * 1. Fetches all active components with reorder points > 0
 * 2. Calculates current quantities using getComponentQuantities()
 * 3. Determines reorder status using calculateReorderStatus()
 * 4. Compares to previous state in ComponentAlertState
 * 5. Returns list of components that need alerts (state transitions)
 */
export async function evaluateLowStockAlerts(
  companyId: string
): Promise<LowStockAlertEvaluation> {
  const evaluatedAt = new Date().toISOString()

  // Get company settings for reorderWarningMultiplier
  const settings = await getCompanySettings(companyId)

  // Fetch all active components with reorder points > 0 for this company
  const components = await prisma.component.findMany({
    where: {
      brand: { companyId },
      isActive: true,
      reorderPoint: { gt: 0 },
    },
    select: {
      id: true,
      name: true,
      skuCode: true,
      reorderPoint: true,
      leadTimeDays: true,
      brand: {
        select: { name: true },
      },
    },
  })

  if (components.length === 0) {
    return {
      companyId,
      evaluatedAt,
      totalComponents: 0,
      componentsNeedingAlert: [],
      newWarnings: 0,
      newCriticals: 0,
      recoveries: 0,
    }
  }

  // Get current quantities for all components
  const componentIds = components.map((c) => c.id)
  const quantities = await getComponentQuantities(componentIds)

  // Get previous states for all components
  const previousStates = await prisma.componentAlertState.findMany({
    where: { componentId: { in: componentIds } },
    select: { componentId: true, lastStatus: true },
  })
  const previousStateMap = new Map(
    previousStates.map((s) => [s.componentId, s.lastStatus as ReorderStatus])
  )

  const componentsNeedingAlert: ComponentAlertNeeded[] = []
  let newWarnings = 0
  let newCriticals = 0
  let recoveries = 0

  // Evaluate each component
  for (const component of components) {
    const quantityOnHand = quantities.get(component.id) ?? 0
    const currentStatus = calculateReorderStatus(
      quantityOnHand,
      component.reorderPoint,
      settings.reorderWarningMultiplier
    )

    // Default to 'ok' if no previous state (new component)
    const previousStatus = previousStateMap.get(component.id) ?? 'ok'
    const transition = getTransition(previousStatus, currentStatus)

    // Update state (always, to track current status)
    const needsAlert = shouldAlert(transition)
    await updateComponentAlertState(component.id, currentStatus, needsAlert)

    // Count by transition type
    if (transition === 'ok_to_warning' || transition === 'critical_to_warning') {
      newWarnings++
    }
    if (transition === 'ok_to_critical' || transition === 'warning_to_critical') {
      newCriticals++
    }
    if (isRecovery(transition)) {
      recoveries++
    }

    // Add to alert list if needs alert
    if (needsAlert) {
      componentsNeedingAlert.push({
        componentId: component.id,
        componentName: component.name,
        skuCode: component.skuCode,
        brandName: component.brand.name,
        previousStatus,
        currentStatus,
        transition,
        quantityOnHand,
        reorderPoint: component.reorderPoint,
        leadTimeDays: component.leadTimeDays,
      })
    }
  }

  return {
    companyId,
    evaluatedAt,
    totalComponents: components.length,
    componentsNeedingAlert,
    newWarnings,
    newCriticals,
    recoveries,
  }
}

/**
 * Check if alerts are enabled for a company
 */
export async function areAlertsEnabled(companyId: string): Promise<boolean> {
  const config = await getAlertConfig(companyId)
  if (!config) return false
  return config.enableSlack || config.enableEmail
}

/**
 * Get components currently in warning or critical status
 * Useful for digest emails
 */
export async function getComponentsInAlertStatus(
  companyId: string
): Promise<{
  warnings: Array<{ componentId: string; componentName: string; quantityOnHand: number; reorderPoint: number }>
  criticals: Array<{ componentId: string; componentName: string; quantityOnHand: number; reorderPoint: number }>
}> {
  const settings = await getCompanySettings(companyId)

  const components = await prisma.component.findMany({
    where: {
      brand: { companyId },
      isActive: true,
      reorderPoint: { gt: 0 },
    },
    select: {
      id: true,
      name: true,
      reorderPoint: true,
    },
  })

  const componentIds = components.map((c) => c.id)
  const quantities = await getComponentQuantities(componentIds)

  const warnings: Array<{ componentId: string; componentName: string; quantityOnHand: number; reorderPoint: number }> = []
  const criticals: Array<{ componentId: string; componentName: string; quantityOnHand: number; reorderPoint: number }> = []

  for (const component of components) {
    const quantityOnHand = quantities.get(component.id) ?? 0
    const status = calculateReorderStatus(
      quantityOnHand,
      component.reorderPoint,
      settings.reorderWarningMultiplier
    )

    if (status === 'warning') {
      warnings.push({
        componentId: component.id,
        componentName: component.name,
        quantityOnHand,
        reorderPoint: component.reorderPoint,
      })
    } else if (status === 'critical') {
      criticals.push({
        componentId: component.id,
        componentName: component.name,
        quantityOnHand,
        reorderPoint: component.reorderPoint,
      })
    }
  }

  return { warnings, criticals }
}

/**
 * Send low-stock alerts via Slack webhook
 * Used by scheduler to deliver alerts
 */
export async function sendSlackAlerts(
  companyId: string,
  alerts: ComponentAlertNeeded[],
  baseUrl: string
): Promise<{ sent: number; errors: string[] }> {
  const config = await getAlertConfig(companyId)

  if (!config || !config.enableSlack || !config.slackWebhookUrl) {
    return { sent: 0, errors: [] }
  }

  const errors: string[] = []

  // Convert alerts to LowStockAlertData format
  const alertData: LowStockAlertData[] = alerts.map((alert) => ({
    componentName: alert.componentName,
    skuCode: alert.skuCode,
    brandName: alert.brandName,
    currentStatus: alert.currentStatus as 'warning' | 'critical',
    quantityOnHand: alert.quantityOnHand,
    reorderPoint: alert.reorderPoint,
    leadTimeDays: alert.leadTimeDays,
    componentId: alert.componentId,
    baseUrl,
  }))

  try {
    if (config.alertMode === 'daily_digest') {
      // Send single digest message
      const message = formatDigestMessage(alertData, baseUrl)
      await sendSlackMessage(config.slackWebhookUrl, message)
      await updateLastDigestSent(companyId)
      return { sent: alerts.length, errors: [] }
    } else {
      // Send individual alerts (per_transition mode)
      let sent = 0
      for (const data of alertData) {
        try {
          const message = formatLowStockAlert(data)
          await sendSlackMessage(config.slackWebhookUrl, message)
          sent++
        } catch (error) {
          errors.push(
            `Failed to send alert for ${data.componentName}: ${error instanceof Error ? error.message : 'Unknown error'}`
          )
        }
      }
      return { sent, errors }
    }
  } catch (error) {
    errors.push(
      `Slack delivery failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
    return { sent: 0, errors }
  }
}

/**
 * Result of alert evaluation run for a single company
 */
export interface AlertEvaluationResult {
  companyId: string
  evaluated: boolean
  componentsEvaluated: number
  alertsTriggered: number
  slackSent: number
  slackErrors: string[]
  emailSent: number
  emailErrors: string[]
  skipped: boolean
  skipReason?: string
}

/**
 * Run alert evaluation for a single company
 * Orchestrates evaluation and delivery
 */
export async function runAlertEvaluation(
  companyId: string,
  baseUrl: string
): Promise<AlertEvaluationResult> {
  const result: AlertEvaluationResult = {
    companyId,
    evaluated: false,
    componentsEvaluated: 0,
    alertsTriggered: 0,
    slackSent: 0,
    slackErrors: [],
    emailSent: 0,
    emailErrors: [],
    skipped: false,
  }

  // Get config
  const config = await getAlertConfig(companyId)
  if (!config) {
    result.skipped = true
    result.skipReason = 'No alert config'
    return result
  }

  if (!config.enableSlack && !config.enableEmail) {
    result.skipped = true
    result.skipReason = 'All channels disabled'
    return result
  }

  // Run evaluation
  const evaluation = await evaluateLowStockAlerts(companyId)
  result.evaluated = true
  result.componentsEvaluated = evaluation.totalComponents
  result.alertsTriggered = evaluation.componentsNeedingAlert.length

  if (evaluation.componentsNeedingAlert.length === 0) {
    console.log(`[Alerts] Company ${companyId}: No alerts needed`)
    return result
  }

  // Send Slack alerts if enabled
  if (config.enableSlack && config.slackWebhookUrl) {
    const slackResult = await sendSlackAlerts(
      companyId,
      evaluation.componentsNeedingAlert,
      baseUrl
    )
    result.slackSent = slackResult.sent
    result.slackErrors = slackResult.errors
  }

  // Email delivery will be added in Issue #107
  // if (config.enableEmail && config.emailAddresses.length > 0) {
  //   const emailResult = await sendEmailAlerts(...)
  //   result.emailSent = emailResult.sent
  //   result.emailErrors = emailResult.errors
  // }

  console.log(`[Alerts] Company ${companyId}: ${result.alertsTriggered} alerts, ${result.slackSent} Slack sent`)

  return result
}

/**
 * Summary of all company alert runs
 */
export interface AlertRunSummary {
  executedAt: string
  companiesProcessed: number
  companiesWithAlerts: number
  totalAlertsTriggered: number
  totalSlackSent: number
  totalEmailSent: number
  errors: Array<{ companyId: string; error: string }>
  results: AlertEvaluationResult[]
}

/**
 * Run alert evaluation for all companies with alerts enabled
 * Called by cron endpoint
 */
export async function runAllCompanyAlerts(
  baseUrl: string
): Promise<AlertRunSummary> {
  const executedAt = new Date().toISOString()
  console.log(`[Alerts] Starting alert run at ${executedAt}`)

  // Find all companies with alerts enabled
  const configs = await prisma.alertConfig.findMany({
    where: {
      OR: [
        { enableSlack: true },
        { enableEmail: true },
      ],
    },
    select: { companyId: true },
  })

  const summary: AlertRunSummary = {
    executedAt,
    companiesProcessed: configs.length,
    companiesWithAlerts: 0,
    totalAlertsTriggered: 0,
    totalSlackSent: 0,
    totalEmailSent: 0,
    errors: [],
    results: [],
  }

  if (configs.length === 0) {
    console.log('[Alerts] No companies with alerts enabled')
    return summary
  }

  // Process each company
  for (const { companyId } of configs) {
    try {
      const result = await runAlertEvaluation(companyId, baseUrl)
      summary.results.push(result)

      if (result.alertsTriggered > 0) {
        summary.companiesWithAlerts++
      }
      summary.totalAlertsTriggered += result.alertsTriggered
      summary.totalSlackSent += result.slackSent
      summary.totalEmailSent += result.emailSent

      if (result.slackErrors.length > 0) {
        summary.errors.push({
          companyId,
          error: `Slack: ${result.slackErrors.join(', ')}`,
        })
      }
    } catch (error) {
      console.error(`[Alerts] Error processing company ${companyId}:`, error)
      summary.errors.push({
        companyId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  console.log(`[Alerts] Run complete: ${summary.companiesProcessed} companies, ${summary.totalAlertsTriggered} alerts, ${summary.errors.length} errors`)

  return summary
}
