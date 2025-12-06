import { z } from 'zod'

// Chat message role
export type ChatRole = 'user' | 'assistant'

// Chat message interface
export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  timestamp: Date
}

// Chat request schema
export const chatRequestSchema = z.object({
  message: z.string().min(1, 'Message is required').max(2000),
  conversationId: z.string().uuid().optional(), // For future history
})

export type ChatRequestInput = z.infer<typeof chatRequestSchema>

// Chat response interface
export interface ChatResponse {
  message: ChatMessage
  conversationId: string
}

// Tool use types for Phase 2

// Tool call status (for UI feedback)
export type ToolCallStatus = 'idle' | 'calling' | 'success' | 'error'

// Tool call metadata for conversation
export interface ToolCallInfo {
  toolName: string
  input: Record<string, unknown>
  status: ToolCallStatus
  result?: unknown
  error?: string
}

// Extended chat message with tool calls
export interface ChatMessageWithTools extends ChatMessage {
  toolCalls?: ToolCallInfo[]
}

// Tool result types
export interface SkuBuildableDetails {
  skuCode: string
  skuName: string
  maxBuildable: number | null
  limitingComponents: Array<{
    componentName: string
    skuCode: string
    quantityOnHand: number
    quantityPerUnit: number
    maxBuildable: number
    rank: number
  }>
  bomLines: Array<{
    componentName: string
    skuCode: string
    quantityPerUnit: number
    quantityOnHand: number
  }>
}

export interface ComponentInventoryDetails {
  componentCode: string
  componentName: string
  totalQuantity: number
  byLocation: Array<{
    locationName: string
    locationType: string
    quantity: number
  }>
  recentTransactions: Array<{
    type: string
    date: string
    quantityChange: number
    notes: string | null
  }>
}

export interface TransactionHistoryResult {
  entityType: 'sku' | 'component'
  code: string
  transactions: Array<{
    id: string
    type: string
    date: string
    quantityChange?: number
    unitsBuild?: number
    notes: string | null
  }>
}

export interface CreateIssueResult {
  issueNumber: number
  issueUrl: string
}
