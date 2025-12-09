/**
 * Email client for low-stock alerts
 * Uses Microsoft Graph API for email delivery via ai-coder@vital-enterprises.com
 */

import { sendGraphEmail, isGraphEmailConfigured } from '@/lib/graph-email'

// Types
export interface EmailMessage {
  to: string[]
  subject: string
  html: string
  text: string
}

export interface LowStockEmailData {
  componentName: string
  skuCode: string
  brandName: string
  currentStatus: 'warning' | 'critical'
  quantityOnHand: number
  reorderPoint: number
  leadTimeDays: number
  componentId: string
  baseUrl: string
  companyName?: string
}

export class EmailDeliveryError extends Error {
  constructor(
    message: string,
    public originalError?: unknown
  ) {
    super(message)
    this.name = 'EmailDeliveryError'
  }
}

/**
 * Check if email is configured (Microsoft Graph credentials present)
 */
export function isEmailConfigured(): boolean {
  return isGraphEmailConfigured()
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/**
 * Send email via Microsoft Graph API
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  if (!isGraphEmailConfigured()) {
    throw new EmailDeliveryError('Email provider not configured. Set Azure AD environment variables.')
  }

  const success = await sendGraphEmail(message.to, message.subject, message.html)

  if (!success) {
    throw new EmailDeliveryError('Failed to send email via Microsoft Graph')
  }
}

/**
 * Format single low-stock alert into email message
 */
export function formatLowStockAlertEmail(data: LowStockEmailData): EmailMessage {
  const severity = data.currentStatus === 'critical' ? 'Critical' : 'Warning'
  const severityColor = data.currentStatus === 'critical' ? '#dc2626' : '#f59e0b'
  const componentUrl = `${data.baseUrl}/components/${data.componentId}`

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
      <h1 style="margin: 0; font-size: 24px;">Low Stock Alert - ${severity}</h1>
    </div>
    <div style="padding: 24px;">
      <p style="margin: 0 0 16px; color: #374151;">A component in your inventory needs attention:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: 600; background-color: #f9fafb;">Component</td>
          <td style="padding: 12px; border: 1px solid #e5e7eb;"><a href="${componentUrl}" style="color: #2563eb;">${data.componentName}</a> (${data.skuCode})</td>
        </tr>
        <tr>
          <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: 600; background-color: #f9fafb;">Brand</td>
          <td style="padding: 12px; border: 1px solid #e5e7eb;">${data.brandName}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: 600; background-color: #f9fafb;">Status</td>
          <td style="padding: 12px; border: 1px solid #e5e7eb; color: ${severityColor}; font-weight: 600;">${severity}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: 600; background-color: #f9fafb;">On Hand</td>
          <td style="padding: 12px; border: 1px solid #e5e7eb;">${data.quantityOnHand} units</td>
        </tr>
        <tr>
          <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: 600; background-color: #f9fafb;">Reorder Point</td>
          <td style="padding: 12px; border: 1px solid #e5e7eb;">${data.reorderPoint} units</td>
        </tr>
        <tr>
          <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: 600; background-color: #f9fafb;">Lead Time</td>
          <td style="padding: 12px; border: 1px solid #e5e7eb;">${data.leadTimeDays} days</td>
        </tr>
      </table>
      <div style="text-align: center; margin-top: 24px;">
        <a href="${componentUrl}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">View Component</a>
      </div>
    </div>
    <div style="background-color: #f9fafb; padding: 16px; text-align: center; font-size: 12px; color: #6b7280;">
      <p style="margin: 0;">Sent by Trevor Inventory${data.companyName ? ` for ${data.companyName}` : ''}</p>
    </div>
  </div>
</body>
</html>`

  const text = `Low Stock Alert - ${severity}

A component in your inventory needs attention:

Component: ${data.componentName} (${data.skuCode})
Brand: ${data.brandName}
Status: ${severity}
On Hand: ${data.quantityOnHand} units
Reorder Point: ${data.reorderPoint} units
Lead Time: ${data.leadTimeDays} days

View Component: ${componentUrl}

Sent by Trevor Inventory`

  return {
    to: [], // Filled in by caller
    subject: `Low Stock Alert [${severity}]: ${data.componentName} (${data.skuCode})`,
    html,
    text,
  }
}

/**
 * Format digest email with multiple alerts
 */
export function formatDigestEmail(
  alerts: LowStockEmailData[],
  baseUrl: string,
  companyName?: string
): EmailMessage {
  const criticals = alerts.filter((a) => a.currentStatus === 'critical')
  const warnings = alerts.filter((a) => a.currentStatus === 'warning')

  // Build table rows for each alert type
  const buildRows = (items: LowStockEmailData[], color: string) =>
    items
      .slice(0, 10)
      .map(
        (a) => `
    <tr>
      <td style="padding: 8px; border: 1px solid #e5e7eb;"><a href="${a.baseUrl}/components/${a.componentId}" style="color: #2563eb;">${a.componentName}</a></td>
      <td style="padding: 8px; border: 1px solid #e5e7eb;">${a.skuCode}</td>
      <td style="padding: 8px; border: 1px solid #e5e7eb; color: ${color}; font-weight: 600;">${a.quantityOnHand}</td>
      <td style="padding: 8px; border: 1px solid #e5e7eb;">${a.reorderPoint}</td>
    </tr>
  `
      )
      .join('')

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f5;">
  <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background-color: #1e40af; color: white; padding: 20px; text-align: center;">
      <h1 style="margin: 0; font-size: 24px;">Low Stock Daily Summary</h1>
    </div>
    <div style="padding: 24px;">
      <p style="margin: 0 0 16px; color: #374151; font-size: 16px;">
        <strong>${alerts.length} components need attention</strong><br>
        <span style="color: #dc2626;">${criticals.length} Critical</span> | <span style="color: #f59e0b;">${warnings.length} Warning</span>
      </p>

      ${
        criticals.length > 0
          ? `
      <h2 style="color: #dc2626; font-size: 18px; margin: 24px 0 12px;">Critical Items</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="background-color: #fef2f2;">
          <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">Component</th>
          <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">SKU</th>
          <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">On Hand</th>
          <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">Reorder</th>
        </tr>
        ${buildRows(criticals, '#dc2626')}
      </table>
      `
          : ''
      }

      ${
        warnings.length > 0
          ? `
      <h2 style="color: #f59e0b; font-size: 18px; margin: 24px 0 12px;">Warning Items</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="background-color: #fefce8;">
          <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">Component</th>
          <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">SKU</th>
          <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">On Hand</th>
          <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">Reorder</th>
        </tr>
        ${buildRows(warnings, '#f59e0b')}
      </table>
      `
          : ''
      }

      ${alerts.length > 20 ? `<p style="color: #6b7280; font-size: 14px; margin-top: 16px;">...and ${alerts.length - 20} more items</p>` : ''}

      <div style="text-align: center; margin-top: 24px;">
        <a href="${baseUrl}/components" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">View All Components</a>
      </div>
    </div>
    <div style="background-color: #f9fafb; padding: 16px; text-align: center; font-size: 12px; color: #6b7280;">
      <p style="margin: 0;">Sent by Trevor Inventory${companyName ? ` for ${companyName}` : ''}</p>
    </div>
  </div>
</body>
</html>`

  const text = `Low Stock Daily Summary

${alerts.length} components need attention
${criticals.length} Critical | ${warnings.length} Warning

${
  criticals.length > 0
    ? `CRITICAL ITEMS:
${criticals
  .slice(0, 10)
  .map((a) => `- ${a.componentName} (${a.skuCode}): ${a.quantityOnHand} on hand, reorder at ${a.reorderPoint}`)
  .join('\n')}
`
    : ''
}
${
  warnings.length > 0
    ? `WARNING ITEMS:
${warnings
  .slice(0, 10)
  .map((a) => `- ${a.componentName} (${a.skuCode}): ${a.quantityOnHand} on hand, reorder at ${a.reorderPoint}`)
  .join('\n')}
`
    : ''
}
View all: ${baseUrl}/components

Sent by Trevor Inventory`

  return {
    to: [],
    subject: `Low Stock Summary: ${criticals.length} Critical, ${warnings.length} Warning`,
    html,
    text,
  }
}

/**
 * Format test email for connection verification
 */
export function formatTestEmail(): EmailMessage {
  return {
    to: [],
    subject: 'Trevor Inventory - Email Connection Test',
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f5;">
  <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background-color: #10b981; color: white; padding: 20px; text-align: center;">
      <h1 style="margin: 0; font-size: 24px;">Email Connection Test</h1>
    </div>
    <div style="padding: 24px; text-align: center;">
      <p style="font-size: 48px; margin: 0;">&#10003;</p>
      <p style="margin: 16px 0 0; color: #374151; font-size: 16px;">Your email alerts are configured correctly!</p>
      <p style="margin: 8px 0 0; color: #6b7280; font-size: 14px;">You will receive low-stock alerts at this address.</p>
    </div>
  </div>
</body>
</html>`,
    text: `Email Connection Test

Your email alerts are configured correctly!
You will receive low-stock alerts at this address.

Sent by Trevor Inventory`,
  }
}
