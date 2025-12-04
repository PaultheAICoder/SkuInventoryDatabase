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

// ============================================
// Feedback Tracking Types (Database Entities)
// ============================================

// Feedback status enum (matches Prisma)
export type FeedbackStatus = 'pending' | 'in_progress' | 'resolved' | 'verified' | 'reopened'

// Feedback reply action enum
export type FeedbackReplyAction = 'verified' | 'changes_requested'

// Feedback record (database entity)
export interface FeedbackRecord {
  id: string
  userId: string
  userName?: string | null
  userEmail?: string | null
  type: FeedbackType
  description: string
  githubIssueNumber: number
  githubIssueUrl: string
  status: FeedbackStatus
  emailMessageId: string | null
  resolvedAt: string | null
  verifiedAt: string | null
  createdAt: string
  updatedAt: string
  replies?: FeedbackReplyRecord[]
}

// Feedback reply record
export interface FeedbackReplyRecord {
  id: string
  feedbackId: string
  emailMessageId: string | null
  content: string
  action: FeedbackReplyAction
  followUpIssueNumber: number | null
  followUpIssueUrl: string | null
  createdAt: string
}

// Create feedback input (internal, from API)
export interface CreateFeedbackInput {
  userId: string
  type: FeedbackType
  description: string
  githubIssueNumber: number
  githubIssueUrl: string
}

// Update feedback status input
export interface UpdateFeedbackStatusInput {
  status: FeedbackStatus
  resolvedAt?: Date
  verifiedAt?: Date
  emailMessageId?: string
}
