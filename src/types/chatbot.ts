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
