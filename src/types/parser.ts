import { z } from 'zod'

// Transaction action types that can be parsed
export type ParsedTransactionType = 'receipt' | 'outbound' | 'adjustment'

// Confidence level for parsed values
export type ConfidenceLevel = 'high' | 'medium' | 'low'

// Parsed field with confidence
export interface ParsedField<T> {
  value: T
  confidence: ConfidenceLevel
  rawText?: string
}

// Result of parsing natural language input
export interface ParsedTransaction {
  transactionType: ParsedField<ParsedTransactionType>
  itemType: ParsedField<'sku' | 'component'>
  itemId: ParsedField<string | null>
  itemName: ParsedField<string>
  quantity: ParsedField<number>
  salesChannel?: ParsedField<string | null>
  supplier?: ParsedField<string | null>
  date: ParsedField<Date>
  reason?: ParsedField<string | null>
  location?: ParsedField<string | null>
  notes?: ParsedField<string | null>
  overallConfidence: ConfidenceLevel
  originalInput: string
}

// API request schema
export const parseTransactionInputSchema = z.object({
  text: z.string().min(1, 'Input text is required').max(500, 'Input too long'),
})

export type ParseTransactionInput = z.infer<typeof parseTransactionInputSchema>

// Suggestion for a parsed field
export interface ParseSuggestion {
  field: string
  currentValue: string | number | null
  alternatives: Array<{ value: string; label: string }>
}

// API response type
export interface ParseTransactionResponse {
  parsed: ParsedTransaction
  suggestions: ParseSuggestion[]
  error?: string
}

// Match result from fuzzy search
export interface FuzzyMatchResult {
  id: string
  name: string
  score: number
  type: 'sku' | 'component'
}

// Context for parsing (passed to parser)
export interface ParserContext {
  components: Array<{
    id: string
    name: string
    skuCode: string
  }>
  skus: Array<{
    id: string
    name: string
    internalCode: string | null
    salesChannel: string | null
  }>
  locations: Array<{
    id: string
    name: string
  }>
}

// Raw response from Claude before processing
export interface RawClaudeParseResponse {
  action: 'ship' | 'receive' | 'adjust' | 'outbound'
  item: string
  quantity: number
  channel: string | null
  date: string
  supplier: string | null
  reason: string | null
  location: string | null
  notes: string | null
}
