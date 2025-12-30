/**
 * Container Health Alert Service
 *
 * Sends notifications when containers fail or become unhealthy
 */

import { sendSlackMessage, type SlackMessage, type SlackBlock } from '@/lib/slack'
import { sendEmail, type EmailMessage } from '@/lib/email'
import { getMonitorConfig } from './container-health'
import type { ContainerStatus, ContainerEventType } from '@/types/container-health'

export interface ContainerAlertData {
  containerName: string
  containerId?: string
  status: ContainerStatus
  eventType: ContainerEventType
  exitCode?: number
  errorMessage?: string
  restartAttempt?: number
  maxRestarts?: number
  timestamp: string
}

/**
 * Format container alert for Slack
 */
export function formatContainerAlertSlack(data: ContainerAlertData): SlackMessage {
  const emoji = data.status === 'unhealthy' ? ':red_circle:' :
                data.eventType === 'die' ? ':skull:' :
                data.eventType === 'restart' ? ':arrows_counterclockwise:' : ':warning:'

  const title = data.eventType === 'die'
    ? `Container Stopped: ${data.containerName}`
    : data.eventType === 'auto_restart_failed'
    ? `Auto-Restart Failed: ${data.containerName}`
    : `Container Unhealthy: ${data.containerName}`

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${emoji} ${title}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Container:*\n${data.containerName}`,
        },
        {
          type: 'mrkdwn',
          text: `*Status:*\n${data.status}`,
        },
        {
          type: 'mrkdwn',
          text: `*Event:*\n${data.eventType}`,
        },
        {
          type: 'mrkdwn',
          text: `*Time:*\n${new Date(data.timestamp).toLocaleString()}`,
        },
      ],
    },
  ]

  if (data.exitCode !== undefined) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Exit Code:* ${data.exitCode}`,
      },
    })
  }

  if (data.errorMessage) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Error:*\n\`\`\`${data.errorMessage.slice(0, 500)}\`\`\``,
      },
    })
  }

  if (data.restartAttempt !== undefined) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Restart Attempt:* ${data.restartAttempt} of ${data.maxRestarts ?? 5}`,
      },
    })
  }

  blocks.push({ type: 'divider' })

  return {
    text: title,
    blocks,
  }
}

/**
 * Format container alert for email
 */
export function formatContainerAlertEmail(data: ContainerAlertData): EmailMessage {
  const title = data.eventType === 'die'
    ? `Container Stopped: ${data.containerName}`
    : data.eventType === 'auto_restart_failed'
    ? `Auto-Restart Failed: ${data.containerName}`
    : `Container Unhealthy: ${data.containerName}`

  const severityColor = data.status === 'unhealthy' || data.eventType === 'die' ? '#dc2626' : '#f59e0b'

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f5;">
  <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background-color: ${severityColor}; color: white; padding: 20px; text-align: center;">
      <h1 style="margin: 0; font-size: 24px;">Docker Container Alert</h1>
    </div>
    <div style="padding: 24px;">
      <h2 style="margin: 0 0 16px; color: #374151;">${title}</h2>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: 600; background-color: #f9fafb;">Container</td>
          <td style="padding: 12px; border: 1px solid #e5e7eb;">${data.containerName}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: 600; background-color: #f9fafb;">Status</td>
          <td style="padding: 12px; border: 1px solid #e5e7eb; color: ${severityColor}; font-weight: 600;">${data.status}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: 600; background-color: #f9fafb;">Event Type</td>
          <td style="padding: 12px; border: 1px solid #e5e7eb;">${data.eventType}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: 600; background-color: #f9fafb;">Timestamp</td>
          <td style="padding: 12px; border: 1px solid #e5e7eb;">${new Date(data.timestamp).toLocaleString()}</td>
        </tr>
        ${data.exitCode !== undefined ? `
        <tr>
          <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: 600; background-color: #f9fafb;">Exit Code</td>
          <td style="padding: 12px; border: 1px solid #e5e7eb;">${data.exitCode}</td>
        </tr>
        ` : ''}
        ${data.restartAttempt !== undefined ? `
        <tr>
          <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: 600; background-color: #f9fafb;">Restart Attempt</td>
          <td style="padding: 12px; border: 1px solid #e5e7eb;">${data.restartAttempt} of ${data.maxRestarts ?? 5}</td>
        </tr>
        ` : ''}
      </table>
      ${data.errorMessage ? `
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 4px; padding: 12px; margin-top: 16px;">
        <strong style="color: #991b1b;">Error Details:</strong>
        <pre style="margin: 8px 0 0; white-space: pre-wrap; font-size: 12px; color: #374151;">${data.errorMessage.slice(0, 1000)}</pre>
      </div>
      ` : ''}
    </div>
    <div style="background-color: #f9fafb; padding: 16px; text-align: center; font-size: 12px; color: #6b7280;">
      <p style="margin: 0;">Sent by Trevor Inventory Docker Health Monitor</p>
    </div>
  </div>
</body>
</html>`

  const text = `${title}

Container: ${data.containerName}
Status: ${data.status}
Event: ${data.eventType}
Time: ${new Date(data.timestamp).toLocaleString()}
${data.exitCode !== undefined ? `Exit Code: ${data.exitCode}` : ''}
${data.restartAttempt !== undefined ? `Restart Attempt: ${data.restartAttempt} of ${data.maxRestarts ?? 5}` : ''}
${data.errorMessage ? `\nError: ${data.errorMessage}` : ''}

Sent by Trevor Inventory Docker Health Monitor`

  return {
    to: [],
    subject: `[Docker Alert] ${title}`,
    html,
    text,
  }
}

/**
 * Send container alert via all configured channels
 */
export async function sendContainerAlert(
  data: ContainerAlertData
): Promise<{ slackSent: boolean; emailSent: boolean; errors: string[] }> {
  const config = await getMonitorConfig()
  const errors: string[] = []
  let slackSent = false
  let emailSent = false

  if (!config) {
    return { slackSent: false, emailSent: false, errors: ['Monitor config not found'] }
  }

  // Send Slack alert
  if (config.enableSlackAlerts && config.slackWebhookUrl) {
    try {
      const message = formatContainerAlertSlack(data)
      await sendSlackMessage(config.slackWebhookUrl, message)
      slackSent = true
    } catch (error) {
      errors.push(`Slack: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Send email alerts
  if (config.enableEmailAlerts && config.alertEmailAddresses.length > 0) {
    try {
      const message = formatContainerAlertEmail(data)
      message.to = config.alertEmailAddresses
      await sendEmail(message)
      emailSent = true
    } catch (error) {
      errors.push(`Email: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  return { slackSent, emailSent, errors }
}
