/**
 * Slack webhook client for sending low-stock alerts
 * Uses Slack Block Kit for rich message formatting
 */

// Types
export interface SlackMessage {
  blocks: SlackBlock[]
  text?: string // Fallback text for notifications
}

export interface SlackBlock {
  type: string
  text?: { type: string; text: string; emoji?: boolean }
  fields?: Array<{ type: string; text: string }>
  accessory?: unknown
}

export interface LowStockAlertData {
  componentName: string
  skuCode: string
  brandName: string
  currentStatus: 'warning' | 'critical'
  quantityOnHand: number
  reorderPoint: number
  leadTimeDays: number
  componentId: string
  baseUrl: string
}

export class SlackWebhookError extends Error {
  constructor(
    message: string,
    public statusCode?: number
  ) {
    super(message)
    this.name = 'SlackWebhookError'
  }
}

/**
 * Validate Slack webhook URL format
 * Must start with https://hooks.slack.com/services/
 */
export function isValidSlackWebhookUrl(url: string): boolean {
  return /^https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[a-zA-Z0-9]+$/.test(url)
}

/**
 * Format single alert into Slack Block Kit message
 */
export function formatLowStockAlert(data: LowStockAlertData): SlackMessage {
  const severityEmoji = data.currentStatus === 'critical' ? ':red_circle:' : ':warning:'
  const severityText = data.currentStatus === 'critical' ? 'Critical' : 'Warning'
  const componentUrl = `${data.baseUrl}/components/${data.componentId}`

  return {
    text: `Low Stock Alert - ${severityText}: ${data.componentName} (${data.skuCode})`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${severityEmoji} Low Stock Alert - ${severityText}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Component:*\n<${componentUrl}|${data.componentName} (${data.skuCode})>`,
          },
          {
            type: 'mrkdwn',
            text: `*Brand:*\n${data.brandName}`,
          },
          {
            type: 'mrkdwn',
            text: `*On Hand:*\n${data.quantityOnHand} units`,
          },
          {
            type: 'mrkdwn',
            text: `*Reorder Point:*\n${data.reorderPoint} units`,
          },
        ],
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Lead Time:*\n${data.leadTimeDays} days`,
          },
          {
            type: 'mrkdwn',
            text: `*Status:*\n${severityEmoji} ${severityText}`,
          },
        ],
      },
      {
        type: 'divider',
      },
    ],
  }
}

/**
 * Format test message for connection verification
 */
export function formatTestMessage(): SlackMessage {
  return {
    text: 'Trevor Inventory - Test Connection',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: ':white_check_mark: Slack Connection Test',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Your Slack webhook is configured correctly! You will receive low-stock alerts through this channel.',
        },
      },
    ],
  }
}

/**
 * Send message to Slack webhook
 */
export async function sendSlackMessage(
  webhookUrl: string,
  message: SlackMessage
): Promise<void> {
  if (!isValidSlackWebhookUrl(webhookUrl)) {
    throw new SlackWebhookError('Invalid Slack webhook URL format')
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => 'Unknown error')
    throw new SlackWebhookError(
      `Slack webhook failed: ${text}`,
      response.status
    )
  }
}

/**
 * Format multiple alerts as a single digest message
 */
export function formatDigestMessage(
  alerts: LowStockAlertData[],
  baseUrl: string
): SlackMessage {
  const criticals = alerts.filter((a) => a.currentStatus === 'critical')
  const warnings = alerts.filter((a) => a.currentStatus === 'warning')

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: ':package: Low Stock Alert Digest',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${alerts.length} components need attention*\n:red_circle: ${criticals.length} Critical | :warning: ${warnings.length} Warning`,
      },
    },
    { type: 'divider' },
  ]

  // Add critical items first (max 10)
  for (const alert of criticals.slice(0, 10)) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:red_circle: *<${baseUrl}/components/${alert.componentId}|${alert.componentName}>* (${alert.skuCode})\nOn Hand: ${alert.quantityOnHand} | Reorder: ${alert.reorderPoint}`,
      },
    })
  }

  // Add warning items (max 10)
  for (const alert of warnings.slice(0, 10)) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:warning: *<${baseUrl}/components/${alert.componentId}|${alert.componentName}>* (${alert.skuCode})\nOn Hand: ${alert.quantityOnHand} | Reorder: ${alert.reorderPoint}`,
      },
    })
  }

  if (alerts.length > 20) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `_...and ${alerts.length - 20} more items. View all in the <${baseUrl}/components|inventory dashboard>._`,
      },
    })
  }

  return {
    text: `Low Stock Digest: ${criticals.length} critical, ${warnings.length} warning`,
    blocks,
  }
}
