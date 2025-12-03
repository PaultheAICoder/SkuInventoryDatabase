import { z } from 'zod'

// Feedback type enum
export type FeedbackType = 'bug' | 'feature'

// Feedback dialog step enum
export type FeedbackStep = 'select-type' | 'describe' | 'clarify' | 'submitting' | 'success' | 'error'

// Clarify request schema
export const clarifyRequestSchema = z.object({
  type: z.enum(['bug', 'feature']),
  description: z.string().min(10, 'Description must be at least 10 characters').max(2000),
})

export type ClarifyRequestInput = z.infer<typeof clarifyRequestSchema>

// Clarify response interface
export interface ClarifyResponse {
  questions: string[]
}

// Submit feedback request schema
export const submitFeedbackSchema = z.object({
  type: z.enum(['bug', 'feature']),
  description: z.string().min(10).max(2000),
  answers: z.array(z.string()).length(3, 'Must provide exactly 3 answers'),
})

export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>

// Submit feedback response interface
export interface SubmitFeedbackResponse {
  issueUrl: string
  issueNumber: number
}

// Rate limit tracking (in-memory, per session)
export interface RateLimitEntry {
  userId: string
  count: number
  resetAt: Date
}

// Claude Code headless mode response
export interface ClaudeCodeResponse {
  success: boolean
  issueTitle: string
  issueBody: string
  error?: string
  duration?: number
}

// Issue enhancement request
export interface EnhanceIssueRequest {
  type: FeedbackType
  description: string
  answers: string[]
}
