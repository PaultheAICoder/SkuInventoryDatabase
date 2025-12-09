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

// Note: Feedback tracking is now done via GitHub issues only.
// Submitter info is stored in issue body, not in a database table.
// This eliminates the need for a separate Feedback table.

// ============================================
// Database Types (for Phase 2 feedback service)
// ============================================

// Feedback status enum (matches Prisma FeedbackStatus)
export type FeedbackStatus = 'pending' | 'resolved' | 'verified' | 'changes_requested'

// Database record type (returned from service functions)
export interface FeedbackRecord {
  id: string
  userId: string
  userName?: string
  userEmail?: string
  githubIssueNumber: number
  githubIssueUrl: string
  status: FeedbackStatus
  notificationSentAt: string | null
  notificationMessageId: string | null
  responseReceivedAt: string | null
  responseEmailId: string | null
  responseContent: string | null
  followUpIssueNumber: number | null
  followUpIssueUrl: string | null
  createdAt: string
  updatedAt: string
}

// Input type for creating feedback records
export interface CreateFeedbackInput {
  userId: string
  githubIssueNumber: number
  githubIssueUrl: string
}

// Input type for updating feedback records
export interface UpdateFeedbackInput {
  status?: FeedbackStatus
  notificationSentAt?: Date
  notificationMessageId?: string
  responseReceivedAt?: Date
  responseEmailId?: string
  responseContent?: string
  followUpIssueNumber?: number
  followUpIssueUrl?: string
}
