import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  success,
  unauthorized,
  forbidden,
  serverError,
} from '@/lib/api-response'
import { getAlertConfig } from '@/services/lowstock-alert'
import {
  sendSlackMessage,
  formatTestMessage,
  isValidSlackWebhookUrl,
  SlackWebhookError,
} from '@/lib/slack'

/**
 * POST /api/settings/alerts/test - Test Slack webhook (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return unauthorized()
    }

    if (session.user.role !== 'admin') {
      return forbidden()
    }

    // Check for provided URL or use stored
    const body = await request.json().catch(() => ({}))
    let webhookUrl: string | null = null

    if (body.webhookUrl) {
      // Use provided URL for testing before saving
      webhookUrl = body.webhookUrl
    } else {
      // Use stored config
      const config = await getAlertConfig(session.user.selectedCompanyId)
      webhookUrl = config?.slackWebhookUrl ?? null
    }

    if (!webhookUrl) {
      return success({
        success: false,
        error: 'No webhook URL configured',
      })
    }

    if (!isValidSlackWebhookUrl(webhookUrl)) {
      return success({
        success: false,
        error: 'Invalid Slack webhook URL format. URL must start with https://hooks.slack.com/services/',
      })
    }

    try {
      await sendSlackMessage(webhookUrl, formatTestMessage())
      return success({
        success: true,
        message: 'Test message sent successfully',
      })
    } catch (error) {
      const message =
        error instanceof SlackWebhookError
          ? error.message
          : 'Failed to send test message'
      return success({
        success: false,
        error: message,
      })
    }
  } catch (error) {
    console.error('Error testing Slack webhook:', error)
    return serverError()
  }
}
