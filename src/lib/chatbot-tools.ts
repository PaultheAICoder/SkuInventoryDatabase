/**
 * Chatbot Tools Library
 *
 * Defines Claude tools and handles their execution.
 * Tools enable the chatbot to query real data and create GitHub issues.
 */

import { Octokit } from '@octokit/rest'
import type { Tool, ToolUseBlock, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages'
import {
  getSkuBuildableDetails,
  getComponentInventoryDetails,
  getTransactionHistory,
} from '@/services/chatbot-queries'
import type { CreateIssueResult } from '@/types/chatbot'

// GitHub configuration
const GITHUB_OWNER = 'PaultheAICoder'
const GITHUB_REPO = 'SkuInventoryDatabase'

/**
 * Tool definitions for Claude
 * These describe the available functions Claude can call
 */
export const CHATBOT_TOOLS: Tool[] = [
  {
    name: 'get_sku_buildable_details',
    description: 'Get detailed information about a SKU\'s buildable units, including the max buildable count, all limiting components ranked by constraint severity, and the full BOM (bill of materials) with current inventory levels. Use this to answer questions like "why can I only build X units of SKU Y?"',
    input_schema: {
      type: 'object' as const,
      properties: {
        skuCode: {
          type: 'string',
          description: 'The internal code of the SKU (e.g., "AMZ_3pk", "TGT_6pk")',
        },
      },
      required: ['skuCode'],
    },
  },
  {
    name: 'get_component_inventory',
    description: 'Get detailed inventory information for a component, including total quantity on hand, breakdown by location, and recent transactions. Use this to answer questions about component stock levels.',
    input_schema: {
      type: 'object' as const,
      properties: {
        componentCode: {
          type: 'string',
          description: 'The SKU code of the component (e.g., "Box-3pk", "Insert-Card")',
        },
      },
      required: ['componentCode'],
    },
  },
  {
    name: 'get_transaction_history',
    description: 'Get recent transaction history for a SKU or component. Use this to understand recent inventory changes, receipts, builds, or adjustments.',
    input_schema: {
      type: 'object' as const,
      properties: {
        entityType: {
          type: 'string',
          enum: ['sku', 'component'],
          description: 'Whether to look up transactions for a SKU or a component',
        },
        code: {
          type: 'string',
          description: 'The internal code (for SKU) or SKU code (for component)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of transactions to return (default: 10)',
        },
      },
      required: ['entityType', 'code'],
    },
  },
  {
    name: 'create_bug_issue',
    description: 'Create a GitHub issue for a bug report. Use this when the user confirms they want to report a bug or when data appears incorrect.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: 'A concise title for the bug (e.g., "Component quantity mismatch: Box-3pk shows 234 but expected 500")',
        },
        description: {
          type: 'string',
          description: 'Detailed description of the bug including what was expected vs what was observed',
        },
        severity: {
          type: 'string',
          enum: ['critical', 'high', 'medium', 'low'],
          description: 'Severity of the bug',
        },
        errorDetails: {
          type: 'string',
          description: 'Optional technical error details or data snapshots',
        },
      },
      required: ['title', 'description', 'severity'],
    },
  },
  {
    name: 'create_feature_issue',
    description: 'Create a GitHub issue for a feature request. Use this when the user wants to request new functionality or improvements.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: 'A concise title for the feature request',
        },
        description: {
          type: 'string',
          description: 'Detailed description of the desired feature and its value',
        },
        userStory: {
          type: 'string',
          description: 'Optional user story in format "As a [role], I want [action] so that [benefit]"',
        },
      },
      required: ['title', 'description'],
    },
  },
]

/**
 * Execute a tool call and return the result
 */
export async function executeTool(
  toolUse: ToolUseBlock,
  companyId: string
): Promise<ToolResultBlockParam> {
  const { name, id, input } = toolUse
  const toolInput = input as Record<string, unknown>

  console.log(`[Chatbot] Executing tool: ${name}`, toolInput)

  try {
    let result: unknown

    switch (name) {
      case 'get_sku_buildable_details': {
        const skuCode = toolInput.skuCode as string
        result = await getSkuBuildableDetails(skuCode, companyId)
        if (!result) {
          result = { error: `SKU "${skuCode}" not found` }
        }
        break
      }

      case 'get_component_inventory': {
        const componentCode = toolInput.componentCode as string
        result = await getComponentInventoryDetails(componentCode, companyId)
        if (!result) {
          result = { error: `Component "${componentCode}" not found` }
        }
        break
      }

      case 'get_transaction_history': {
        const entityType = toolInput.entityType as 'sku' | 'component'
        const code = toolInput.code as string
        const limit = (toolInput.limit as number) || 10
        result = await getTransactionHistory(entityType, code, companyId, limit)
        if (!result) {
          result = { error: `${entityType} "${code}" not found` }
        }
        break
      }

      case 'create_bug_issue': {
        result = await createBugIssue({
          title: toolInput.title as string,
          description: toolInput.description as string,
          severity: toolInput.severity as string,
          errorDetails: toolInput.errorDetails as string | undefined,
        })
        break
      }

      case 'create_feature_issue': {
        result = await createFeatureIssue({
          title: toolInput.title as string,
          description: toolInput.description as string,
          userStory: toolInput.userStory as string | undefined,
        })
        break
      }

      default:
        result = { error: `Unknown tool: ${name}` }
    }

    console.log(`[Chatbot] Tool ${name} result:`, result)

    return {
      type: 'tool_result',
      tool_use_id: id,
      content: JSON.stringify(result),
    }
  } catch (error) {
    console.error(`[Chatbot] Tool ${name} error:`, error)
    return {
      type: 'tool_result',
      tool_use_id: id,
      content: JSON.stringify({
        error: error instanceof Error ? error.message : 'Tool execution failed',
      }),
      is_error: true,
    }
  }
}

/**
 * Create a bug issue on GitHub
 */
async function createBugIssue(params: {
  title: string
  description: string
  severity: string
  errorDetails?: string
}): Promise<CreateIssueResult> {
  const githubToken = process.env.GITHUB_API_TOKEN
  if (!githubToken) {
    throw new Error('GITHUB_API_TOKEN not configured')
  }

  const octokit = new Octokit({ auth: githubToken })

  const body = `## Reported Issue
**What's broken**: ${params.description}
**Severity**: ${params.severity}

${params.errorDetails ? `## Error Details\n\`\`\`\n${params.errorDetails}\n\`\`\`\n` : ''}

## Source
Reported via chatbot assistant.

---
*This issue was automatically created from a chatbot conversation.*`

  const { data: issue } = await octokit.issues.create({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    title: params.title,
    body,
    labels: ['bug'],
  })

  return {
    issueNumber: issue.number,
    issueUrl: issue.html_url,
  }
}

/**
 * Create a feature issue on GitHub
 */
async function createFeatureIssue(params: {
  title: string
  description: string
  userStory?: string
}): Promise<CreateIssueResult> {
  const githubToken = process.env.GITHUB_API_TOKEN
  if (!githubToken) {
    throw new Error('GITHUB_API_TOKEN not configured')
  }

  const octokit = new Octokit({ auth: githubToken })

  const body = `## Feature Description
${params.description}

${params.userStory ? `## User Story\n${params.userStory}\n` : ''}

## Source
Requested via chatbot assistant.

---
*This issue was automatically created from a chatbot conversation.*`

  const { data: issue } = await octokit.issues.create({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    title: params.title,
    body,
    labels: ['enhancement'],
  })

  return {
    issueNumber: issue.number,
    issueUrl: issue.html_url,
  }
}
