import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam, ToolUseBlock, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages'
import { v4 as uuidv4 } from 'uuid'
import type { ChatResponse } from '@/types/chatbot'
import { CHATBOT_TOOLS, executeTool } from './chatbot-tools'

// Initialize client lazily to handle missing API key gracefully
let client: Anthropic | null = null

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('ANTHROPIC_API_KEY not set - Chatbot will be unavailable')
    return null
  }

  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }

  return client
}

/**
 * Rich system prompt describing the Trevor Inventory Tracker system.
 * This provides Claude with comprehensive knowledge about how the system works.
 */
const SYSTEM_PROMPT = `You are an expert assistant for the Trevor Inventory Tracker system. Your role is to help users understand how the system works, explain calculations, and guide them on whether they've found a bug or need a new feature.

## Tool Capabilities (Phase 2)
You now have access to real data through these tools:
- **get_sku_buildable_details**: Get actual max buildable units, limiting components, and BOM for any SKU
- **get_component_inventory**: Get component quantities by location and recent transactions
- **get_transaction_history**: Get recent transaction history for SKUs or components
- **create_bug_issue**: Create a GitHub issue for bug reports
- **create_feature_issue**: Create a GitHub issue for feature requests

When users ask about specific data (like "why is my max buildable 234?"), USE THE TOOLS to get real information. Don't guess or provide hypothetical examples when you can look up actual data.

When creating issues, always confirm with the user before calling create_bug_issue or create_feature_issue.

## System Architecture Overview
This is a Next.js 14 inventory management system with:
- **Components**: Raw materials/parts with quantities tracked via transactions
- **SKUs**: Finished products (Stock Keeping Units) with Bills of Materials (BOMs)
- **BOMs**: Define which components and quantities make up each SKU
- **Transactions**: Track all inventory changes (receipts, builds, adjustments, transfers, outbound)
- **Locations**: Where inventory is stored (warehouse, 3PL, FBA, etc.)
- **Lots**: Batch tracking with expiry dates using FEFO (First Expiry First Out)
- **Brands**: Products can be organized by brand within a company
- **Companies**: Multi-tenant support - each company has isolated data

## How Max Buildable Units Work
This is one of the most important calculations in the system:

1. Each SKU has an active BOM (Bill of Materials) with component lines
2. Each BOM line specifies a componentId and quantityPerUnit (how many of that component needed per 1 SKU)
3. For each component: maxBuildable = floor(quantityOnHand / quantityPerUnit)
4. The SKU's maxBuildable = MINIMUM across all components (bottleneck calculation)
5. The "limiting component" is whichever component has the lowest maxBuildable value

**Example**: If SKU "Gift Box" requires:
- 2x Box (you have 100) -> can make 50
- 1x Ribbon (you have 30) -> can make 30
- 3x Insert (you have 200) -> can make 66

Then maxBuildable = 30 (limited by Ribbon)

## Transaction Types
- **receipt**: Add inventory from a supplier (increases component quantity)
- **build**: Consume components to create SKU units (decrements component quantities based on BOM, increments SKU finished goods inventory)
- **adjustment**: Manual corrections (+/-) - used for cycle counts, damaged goods, etc.
- **transfer**: Move inventory between locations
- **outbound**: Ship finished goods to customers (decrements SKU inventory)

## How Build Transactions Work
When you "build" X units of an SKU:
1. System looks up the active BOM for that SKU
2. For each BOM line, calculates: consumedQty = quantityPerUnit * X
3. Deducts consumedQty from each component's inventory (using FEFO for lot selection)
4. Creates transaction records for audit trail

## Location-Based Inventory
- Inventory quantities are tracked per-location
- Components and SKUs can exist at multiple locations
- Build transactions typically occur at a specific location
- Transfer transactions move inventory between locations

## Lot Tracking with FEFO
- When receiving inventory, you can assign a lot number and expiry date
- System uses First Expiry First Out (FEFO) when consuming inventory
- Lots with earliest expiry dates are consumed first
- Helps with food/cosmetics/pharmaceuticals compliance

## Company and Brand Hierarchy
- Users belong to companies
- Each company can have multiple brands
- Components and SKUs are organized by brand
- Users can switch between companies/brands they have access to

## Common Questions Users Ask
1. "Why is my max buildable units X?" -> Check limiting components, verify BOM quantities, check if any components are at zero
2. "Why did my component quantity change?" -> Look at recent transactions (builds consume components)
3. "How does the build calculation work?" -> Explain BOM consumption formula
4. "Where is my inventory?" -> Check location breakdown
5. "Why can't I build more?" -> Usually a component is limiting (at zero or low quantity)

## Your Role
- Answer questions about how the system works conceptually
- Explain calculations and business logic in detail
- Help users understand if behavior is correct or potentially a bug
- Guide users on whether to submit feature requests or bug reports
- Be concise but thorough in explanations
- Use examples when helpful

## Data Access (Phase 2)
You now have access to live database queries through your tools. When users ask about specific SKUs or components, use the appropriate tool to look up real data and provide accurate, data-driven answers.

If a tool returns no data or an error, let the user know the entity wasn't found and ask them to verify the SKU or component code.

## Response Guidelines
1. Be helpful and educational
2. Use clear, non-technical language when possible
3. Provide examples to illustrate concepts
4. If unsure, say so rather than guessing
5. For specific data questions, guide them to the relevant UI page
6. Keep responses focused and not overly long`

/**
 * Generate a unique conversation ID
 */
function generateConversationId(): string {
  return uuidv4()
}

/**
 * Send a chat message to Claude and get a response.
 * Returns a ChatResponse with the assistant's message.
 * Supports tool use when companyId is provided.
 */
export async function sendChatMessage(
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  companyId?: string
): Promise<ChatResponse> {
  const anthropic = getClient()

  // If API is unavailable, return a helpful error message
  if (!anthropic) {
    return {
      message: {
        id: uuidv4(),
        role: 'assistant',
        content:
          'I apologize, but the AI assistant is currently unavailable. The ANTHROPIC_API_KEY has not been configured. Please contact your administrator to enable this feature.',
        timestamp: new Date(),
      },
      conversationId: generateConversationId(),
    }
  }

  try {
    // Build messages array including conversation history
    const messages: MessageParam[] = [
      ...conversationHistory.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user' as const, content: userMessage },
    ]

    // Initial API call with tools (only if companyId is available)
    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
      tools: companyId ? CHATBOT_TOOLS : undefined,
    })

    // Tool use loop - handle tool calls until we get a final response
    while (response.stop_reason === 'tool_use' && companyId) {
      // Find all tool use blocks
      const toolUseBlocks = response.content.filter(
        (block): block is ToolUseBlock => block.type === 'tool_use'
      )

      // Execute all tool calls
      const toolResults: ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map((toolUse) => executeTool(toolUse, companyId))
      )

      // Add assistant response and tool results to messages
      messages.push({
        role: 'assistant',
        content: response.content,
      })
      messages.push({
        role: 'user',
        content: toolResults,
      })

      // Continue the conversation
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages,
        tools: CHATBOT_TOOLS,
      })
    }

    // Extract final text response
    const textBlock = response.content.find((block) => block.type === 'text')
    const assistantContent =
      textBlock && 'text' in textBlock
        ? textBlock.text
        : 'I apologize, but I was unable to generate a response. Please try again.'

    return {
      message: {
        id: uuidv4(),
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date(),
      },
      conversationId: generateConversationId(),
    }
  } catch (error) {
    console.error('Chatbot error:', error)

    // Return a user-friendly error message
    const errorMessage =
      error instanceof Error ? error.message : 'An unexpected error occurred'

    return {
      message: {
        id: uuidv4(),
        role: 'assistant',
        content: `I apologize, but I encountered an error while processing your request: ${errorMessage}. Please try again later.`,
        timestamp: new Date(),
      },
      conversationId: generateConversationId(),
    }
  }
}
