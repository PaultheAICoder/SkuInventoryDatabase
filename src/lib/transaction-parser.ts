import Anthropic from '@anthropic-ai/sdk'
import Fuse from 'fuse.js'
import type {
  ParsedTransaction,
  ParserContext,
  ConfidenceLevel,
  FuzzyMatchResult,
  RawClaudeParseResponse,
} from '@/types/parser'

// Initialize client lazily to handle missing API key gracefully
let client: Anthropic | null = null

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('ANTHROPIC_API_KEY not set - AI transaction parsing will be unavailable')
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
 * Build the system prompt for transaction parsing
 */
function buildParsePrompt(): string {
  return `You are a transaction parser for an inventory management system.
Parse the following natural language input into structured transaction data.

The system tracks:
- Components: Raw materials used to build products (e.g., bottles, caps, labels)
- SKUs: Finished products that are built from components and sold (e.g., "3-Pack", "6-Pack Bundle")

Transaction types:
- "ship" or "build": When SKUs are built/assembled or shipped to customers (uses components from inventory)
- "receive" or "receipt": When components are received from suppliers
- "adjust" or "adjustment": When inventory counts are corrected (damaged, lost, etc.)

Extract the following:
- action: one of "ship" (build transaction), "receive" (receipt transaction), "adjust" (adjustment transaction), "build" (build transaction)
- item: the SKU or component name mentioned (exactly as the user wrote it)
- quantity: numeric quantity (always positive, even for adjustments down)
- channel: sales channel if mentioned (Amazon, Shopify, TikTok, Generic, or null)
- date: transaction date in YYYY-MM-DD format (default to today if not specified)
- supplier: supplier name if this is a receipt (or null)
- notes: any additional context mentioned (or null)

Interpret common patterns:
- "shipped to Amazon" or "sold on Amazon" -> build transaction with Amazon channel
- "received from [name]" or "got in from [name]" -> receipt with supplier
- "adjusted down" or "damaged" or "lost" -> adjustment
- "built" or "made" or "assembled" -> build transaction
- Relative dates: "today" = current date, "yesterday" = day before current date

IMPORTANT: Respond with ONLY valid JSON, no additional text:
{
  "action": "ship|receive|adjust|build",
  "item": "item name as mentioned",
  "quantity": 123,
  "channel": "Amazon|Shopify|TikTok|Generic|null",
  "date": "YYYY-MM-DD",
  "supplier": "supplier name or null",
  "notes": "any additional context or null"
}`
}

/**
 * Parse Claude's response into raw data
 */
function parseClaudeResponse(response: string): RawClaudeParseResponse | null {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('No JSON found in Claude response')
      return null
    }

    const parsed = JSON.parse(jsonMatch[0])

    // Validate required fields
    if (!parsed.action || !parsed.item || typeof parsed.quantity !== 'number') {
      console.error('Missing required fields in parsed response')
      return null
    }

    return {
      action: parsed.action,
      item: parsed.item,
      quantity: parsed.quantity,
      channel: parsed.channel || null,
      date: parsed.date || new Date().toISOString().split('T')[0],
      supplier: parsed.supplier || null,
      notes: parsed.notes || null,
    }
  } catch (error) {
    console.error('Failed to parse Claude response:', error)
    return null
  }
}

/**
 * Calculate confidence based on various factors
 */
function calculateConfidence(
  field: string,
  value: unknown,
  matchScore?: number
): ConfidenceLevel {
  if (value === null || value === undefined) {
    return 'low'
  }

  // For fuzzy match scores (lower is better in Fuse.js)
  if (matchScore !== undefined) {
    if (matchScore < 0.1) return 'high'
    if (matchScore < 0.3) return 'medium'
    return 'low'
  }

  // Field-specific confidence rules
  switch (field) {
    case 'quantity':
      return typeof value === 'number' && value > 0 ? 'high' : 'low'
    case 'date':
      return value ? 'high' : 'medium'
    case 'transactionType':
      return ['receipt', 'build', 'adjustment'].includes(value as string) ? 'high' : 'low'
    case 'salesChannel':
      return ['Amazon', 'Shopify', 'TikTok', 'Generic'].includes(value as string)
        ? 'high'
        : 'medium'
    default:
      return value ? 'medium' : 'low'
  }
}

/**
 * Map action to transaction type
 */
function mapActionToType(action: string): 'receipt' | 'outbound' | 'adjustment' {
  switch (action) {
    case 'receive':
      return 'receipt'
    case 'ship':
    case 'outbound':
      return 'outbound'
    case 'adjust':
      return 'adjustment'
    default:
      return 'outbound' // Default to outbound for unknown actions
  }
}

/**
 * Determine if the item is likely a SKU or component based on context
 */
function inferItemType(
  action: string,
  itemName: string,
  context: ParserContext
): 'sku' | 'component' {
  // Receipts typically involve components
  if (action === 'receive') {
    return 'component'
  }

  // Builds/ships typically involve SKUs
  if (action === 'ship' || action === 'build') {
    return 'sku'
  }

  // For adjustments, check which list has a better match
  const componentFuse = new Fuse(context.components, {
    keys: ['name', 'skuCode'],
    threshold: 0.4,
    includeScore: true,
  })
  const skuFuse = new Fuse(context.skus, {
    keys: ['name', 'internalCode'],
    threshold: 0.4,
    includeScore: true,
  })

  const componentMatch = componentFuse.search(itemName)[0]
  const skuMatch = skuFuse.search(itemName)[0]

  if (!componentMatch && !skuMatch) {
    // Default based on typical adjustment patterns
    return 'component'
  }

  if (!componentMatch) return 'sku'
  if (!skuMatch) return 'component'

  // Return the one with better score (lower is better)
  return (componentMatch.score || 1) <= (skuMatch.score || 1) ? 'component' : 'sku'
}

/**
 * Fuzzy match an item name against components and SKUs
 */
export function fuzzyMatchItem(
  itemName: string,
  itemType: 'sku' | 'component',
  context: ParserContext
): FuzzyMatchResult[] {
  if (itemType === 'component') {
    const componentFuse = new Fuse(context.components, {
      keys: ['name', 'skuCode'],
      threshold: 0.4,
      includeScore: true,
    })
    const results = componentFuse.search(itemName)
    return results.slice(0, 5).map((result) => ({
      id: result.item.id,
      name: result.item.name,
      score: result.score || 0,
      type: 'component' as const,
    }))
  } else {
    const skuFuse = new Fuse(context.skus, {
      keys: ['name', 'internalCode'],
      threshold: 0.4,
      includeScore: true,
    })
    const results = skuFuse.search(itemName)
    return results.slice(0, 5).map((result) => ({
      id: result.item.id,
      name: result.item.name,
      score: result.score || 0,
      type: 'sku' as const,
    }))
  }
}

/**
 * Resolve item name to database record
 */
export function resolveItemToRecord(
  itemName: string,
  itemType: 'sku' | 'component',
  context: Pick<ParserContext, 'components' | 'skus'>
): { id: string; confidence: ConfidenceLevel; name: string } | null {
  const matches = fuzzyMatchItem(itemName, itemType, { ...context, locations: [] })

  if (matches.length === 0) {
    return null
  }

  const bestMatch = matches[0]
  return {
    id: bestMatch.id,
    name: bestMatch.name,
    confidence: calculateConfidence('item', bestMatch, bestMatch.score),
  }
}

/**
 * Create fallback parsing when AI is unavailable
 */
function createFallbackParse(text: string, _context: ParserContext): ParsedTransaction {
  // Simple regex-based fallback parsing
  const quantityMatch = text.match(/(\d+)\s*(units?|pcs?|pieces?|packs?|casepacks?|bottles?|caps?|labels?)?/i)
  const quantity = quantityMatch ? parseInt(quantityMatch[1], 10) : 0

  // Detect transaction type from keywords
  let transactionType: 'receipt' | 'outbound' | 'adjustment' = 'outbound'
  if (/receiv|got\s+in|came\s+in|from\s+supplier/i.test(text)) {
    transactionType = 'receipt'
  } else if (/adjust|correct|damag|lost|missing/i.test(text)) {
    transactionType = 'adjustment'
  }

  // Detect sales channel
  let salesChannel: string | null = null
  if (/amazon|fba/i.test(text)) salesChannel = 'Amazon'
  else if (/shopify/i.test(text)) salesChannel = 'Shopify'
  else if (/tiktok/i.test(text)) salesChannel = 'TikTok'

  // Try to extract item name (words that might be product names)
  const itemType: 'sku' | 'component' = transactionType === 'receipt' ? 'component' : 'sku'

  return {
    transactionType: {
      value: transactionType,
      confidence: 'low',
    },
    itemType: {
      value: itemType,
      confidence: 'low',
    },
    itemId: {
      value: null,
      confidence: 'low',
    },
    itemName: {
      value: text.substring(0, 50),
      confidence: 'low',
    },
    quantity: {
      value: quantity,
      confidence: quantity > 0 ? 'medium' : 'low',
    },
    salesChannel: {
      value: salesChannel,
      confidence: salesChannel ? 'medium' : 'low',
    },
    date: {
      value: new Date(),
      confidence: 'medium',
    },
    overallConfidence: 'low',
    originalInput: text,
  }
}

/**
 * Main function to parse transaction text using Claude
 */
export async function parseTransactionText(
  text: string,
  context: ParserContext
): Promise<ParsedTransaction> {
  const anthropic = getClient()

  // Use fallback if AI unavailable
  if (!anthropic) {
    console.warn('Using fallback parser - AI unavailable')
    return createFallbackParse(text, context)
  }

  try {
    const today = new Date().toISOString().split('T')[0]
    const systemPrompt = buildParsePrompt()

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `Today's date is ${today}.\n\nParse this input: "${text}"`,
        },
      ],
      system: systemPrompt,
    })

    // Extract text from response
    const textContent = message.content.find((block) => block.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      console.error('No text content in Claude response')
      return createFallbackParse(text, context)
    }

    const rawParsed = parseClaudeResponse(textContent.text)
    if (!rawParsed) {
      return createFallbackParse(text, context)
    }

    // Convert raw response to ParsedTransaction
    const transactionType = mapActionToType(rawParsed.action)
    const itemType = inferItemType(rawParsed.action, rawParsed.item, context)

    // Parse the date - IMPORTANT: Append time to prevent UTC midnight interpretation
    // Without time component, "2025-11-17" is parsed as midnight UTC, which displays
    // as 11/16 in Pacific Time. By appending T00:00:00, the date is parsed as local time.
    let parsedDate: Date
    try {
      // Append time component if date is in YYYY-MM-DD format
      const dateString = rawParsed.date.includes('T')
        ? rawParsed.date
        : `${rawParsed.date}T00:00:00`
      parsedDate = new Date(dateString)
      if (isNaN(parsedDate.getTime())) {
        parsedDate = new Date()
      }
    } catch {
      parsedDate = new Date()
    }

    // Build the parsed transaction
    const parsed: ParsedTransaction = {
      transactionType: {
        value: transactionType,
        confidence: calculateConfidence('transactionType', transactionType),
      },
      itemType: {
        value: itemType,
        confidence: 'medium',
        rawText: rawParsed.item,
      },
      itemId: {
        value: null, // Will be resolved later
        confidence: 'low',
      },
      itemName: {
        value: rawParsed.item,
        confidence: 'high',
        rawText: rawParsed.item,
      },
      quantity: {
        value: Math.abs(rawParsed.quantity),
        confidence: calculateConfidence('quantity', rawParsed.quantity),
      },
      date: {
        value: parsedDate,
        confidence: calculateConfidence('date', rawParsed.date),
      },
      overallConfidence: 'medium',
      originalInput: text,
    }

    // Add optional fields based on transaction type
    if (transactionType === 'outbound') {
      parsed.salesChannel = {
        value: rawParsed.channel,
        confidence: calculateConfidence('salesChannel', rawParsed.channel),
      }
    }

    if (transactionType === 'receipt') {
      parsed.supplier = {
        value: rawParsed.supplier,
        confidence: rawParsed.supplier ? 'high' : 'low',
      }
    }

    if (rawParsed.notes) {
      parsed.notes = {
        value: rawParsed.notes,
        confidence: 'medium',
      }
    }

    return parsed
  } catch (error) {
    console.error('Error parsing transaction with Claude:', error)
    return createFallbackParse(text, context)
  }
}

/**
 * Build suggestions for fields with low confidence
 */
export function buildSuggestions(
  parsed: ParsedTransaction,
  context: Pick<ParserContext, 'components' | 'skus'>
): Array<{
  field: string
  currentValue: string | number | null
  alternatives: Array<{ value: string; label: string }>
}> {
  const suggestions: Array<{
    field: string
    currentValue: string | number | null
    alternatives: Array<{ value: string; label: string }>
  }> = []

  // Suggest alternative items if confidence is low
  if (parsed.itemId.confidence === 'low' || !parsed.itemId.value) {
    const items = parsed.itemType.value === 'component' ? context.components : context.skus
    const alternatives = items.slice(0, 5).map((item) => ({
      value: item.id,
      label: item.name,
    }))

    if (alternatives.length > 0) {
      suggestions.push({
        field: 'itemId',
        currentValue: parsed.itemName.value,
        alternatives,
      })
    }
  }

  return suggestions
}
