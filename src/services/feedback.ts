/**
 * Feedback Service
 *
 * Provides CRUD operations for feedback tracking:
 * - Creating feedback records linked to GitHub issues
 * - Retrieving feedback by ID or issue number
 * - Updating feedback status through resolution workflow
 * - Managing email monitor state persistence
 */

import { prisma } from '@/lib/db'
import type {
  FeedbackRecord,
  FeedbackStatus,
  CreateFeedbackInput,
  UpdateFeedbackInput,
} from '@/types/feedback'

/**
 * Helper to transform Prisma Feedback to FeedbackRecord
 */
function toFeedbackRecord(
  feedback: {
    id: string
    userId: string
    projectId: string
    githubIssueNumber: number
    githubIssueUrl: string
    status: string
    notificationSentAt: Date | null
    notificationMessageId: string | null
    responseReceivedAt: Date | null
    responseEmailId: string | null
    responseContent: string | null
    followUpIssueNumber: number | null
    followUpIssueUrl: string | null
    clarificationSentAt: Date | null
    clarificationMessageId: string | null
    clarificationQuestions: string | null
    clarificationAnswers: string | null
    clarificationContext: string | null
    createdAt: Date
    updatedAt: Date
    user?: { name: string | null; email: string }
  }
): FeedbackRecord {
  return {
    id: feedback.id,
    userId: feedback.userId,
    projectId: feedback.projectId,
    userName: feedback.user?.name ?? undefined,
    userEmail: feedback.user?.email,
    githubIssueNumber: feedback.githubIssueNumber,
    githubIssueUrl: feedback.githubIssueUrl,
    status: feedback.status as FeedbackStatus,
    notificationSentAt: feedback.notificationSentAt?.toISOString() ?? null,
    notificationMessageId: feedback.notificationMessageId,
    responseReceivedAt: feedback.responseReceivedAt?.toISOString() ?? null,
    responseEmailId: feedback.responseEmailId,
    responseContent: feedback.responseContent,
    followUpIssueNumber: feedback.followUpIssueNumber,
    followUpIssueUrl: feedback.followUpIssueUrl,
    clarificationSentAt: feedback.clarificationSentAt?.toISOString() ?? null,
    clarificationMessageId: feedback.clarificationMessageId,
    clarificationQuestions: feedback.clarificationQuestions,
    clarificationAnswers: feedback.clarificationAnswers,
    clarificationContext: feedback.clarificationContext,
    createdAt: feedback.createdAt.toISOString(),
    updatedAt: feedback.updatedAt.toISOString(),
  }
}

/**
 * Create a new feedback record
 */
export async function createFeedback(input: CreateFeedbackInput): Promise<FeedbackRecord> {
  const feedback = await prisma.feedback.create({
    data: {
      userId: input.userId,
      githubIssueNumber: input.githubIssueNumber,
      githubIssueUrl: input.githubIssueUrl,
      projectId: input.projectId ?? 'SkuInventoryDatabase',
      status: 'pending',
    },
    include: {
      user: {
        select: { name: true, email: true },
      },
    },
  })

  return toFeedbackRecord(feedback)
}

/**
 * Get feedback by GitHub issue number
 */
export async function getFeedbackByIssueNumber(
  issueNumber: number
): Promise<FeedbackRecord | null> {
  const feedback = await prisma.feedback.findUnique({
    where: { githubIssueNumber: issueNumber },
    include: {
      user: {
        select: { name: true, email: true },
      },
    },
  })

  if (!feedback) return null
  return toFeedbackRecord(feedback)
}

/**
 * Get feedback by ID
 */
export async function getFeedbackById(id: string): Promise<FeedbackRecord | null> {
  const feedback = await prisma.feedback.findUnique({
    where: { id },
    include: {
      user: {
        select: { name: true, email: true },
      },
    },
  })

  if (!feedback) return null
  return toFeedbackRecord(feedback)
}

/**
 * Update feedback status and related fields
 */
export async function updateFeedbackStatus(
  id: string,
  input: UpdateFeedbackInput
): Promise<FeedbackRecord> {
  const feedback = await prisma.feedback.update({
    where: { id },
    data: {
      ...(input.status && { status: input.status }),
      ...(input.notificationSentAt && { notificationSentAt: input.notificationSentAt }),
      ...(input.notificationMessageId && { notificationMessageId: input.notificationMessageId }),
      ...(input.responseReceivedAt && { responseReceivedAt: input.responseReceivedAt }),
      ...(input.responseEmailId && { responseEmailId: input.responseEmailId }),
      ...(input.responseContent !== undefined && { responseContent: input.responseContent }),
      ...(input.followUpIssueNumber && { followUpIssueNumber: input.followUpIssueNumber }),
      ...(input.followUpIssueUrl && { followUpIssueUrl: input.followUpIssueUrl }),
      // Clarification fields
      ...(input.clarificationSentAt && { clarificationSentAt: input.clarificationSentAt }),
      ...(input.clarificationMessageId && { clarificationMessageId: input.clarificationMessageId }),
      ...(input.clarificationQuestions !== undefined && { clarificationQuestions: input.clarificationQuestions }),
      ...(input.clarificationAnswers !== undefined && { clarificationAnswers: input.clarificationAnswers }),
      ...(input.clarificationContext !== undefined && { clarificationContext: input.clarificationContext }),
    },
    include: {
      user: {
        select: { name: true, email: true },
      },
    },
  })

  return toFeedbackRecord(feedback)
}

/**
 * Get all feedback in 'pending' status
 * Used for verification reminder workflows
 */
export async function getPendingFeedback(): Promise<FeedbackRecord[]> {
  const feedbacks = await prisma.feedback.findMany({
    where: { status: 'pending' },
    include: {
      user: {
        select: { name: true, email: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return feedbacks.map(toFeedbackRecord)
}

/**
 * Get all feedback in 'resolved' status
 * Used by email monitoring to match incoming replies
 */
export async function getResolvedFeedback(): Promise<FeedbackRecord[]> {
  const feedbacks = await prisma.feedback.findMany({
    where: { status: 'resolved' },
    include: {
      user: {
        select: { name: true, email: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return feedbacks.map(toFeedbackRecord)
}

// ============================================
// Email Monitor State Management
// ============================================

const SINGLETON_ID = 'singleton'

/**
 * Get the last email check time
 * Returns the current time if no state exists (first run)
 */
export async function getLastCheckTime(): Promise<Date> {
  const state = await prisma.emailMonitorState.findUnique({
    where: { id: SINGLETON_ID },
  })

  if (!state) {
    // First run - return 15 minutes ago as default
    return new Date(Date.now() - 15 * 60 * 1000)
  }

  return state.lastCheckTime
}

/**
 * Update the last email check time
 * Creates the singleton record if it doesn't exist
 */
export async function updateLastCheckTime(time: Date): Promise<void> {
  await prisma.emailMonitorState.upsert({
    where: { id: SINGLETON_ID },
    create: {
      id: SINGLETON_ID,
      lastCheckTime: time,
    },
    update: {
      lastCheckTime: time,
    },
  })
}

// ============================================
// Clarification Flow Management
// ============================================

/**
 * Get all feedback in 'clarification_requested' status
 * Used by email monitor to process clarification responses
 */
export async function getClarificationRequestedFeedback(): Promise<FeedbackRecord[]> {
  const feedbacks = await prisma.feedback.findMany({
    where: { status: 'clarification_requested' },
    include: {
      user: {
        select: { name: true, email: true },
      },
    },
    orderBy: { clarificationSentAt: 'asc' },
  })

  return feedbacks.map(toFeedbackRecord)
}

/**
 * Get feedback records that have timed out waiting for clarification
 * Used to create follow-up issues after timeout period
 *
 * @param timeoutHours - Number of hours after which to consider clarification timed out (default: 48)
 * @returns Array of feedback records that have exceeded the timeout
 */
export async function getTimedOutClarifications(
  timeoutHours: number = 48
): Promise<FeedbackRecord[]> {
  const timeoutDate = new Date(Date.now() - timeoutHours * 60 * 60 * 1000)

  const feedbacks = await prisma.feedback.findMany({
    where: {
      status: 'clarification_requested',
      clarificationSentAt: {
        lt: timeoutDate,
      },
    },
    include: {
      user: {
        select: { name: true, email: true },
      },
    },
    orderBy: { clarificationSentAt: 'asc' },
  })

  return feedbacks.map(toFeedbackRecord)
}

/**
 * Update feedback to clarification_requested state
 * Called when initial rejection detected and clarification email sent
 */
export async function updateFeedbackClarification(
  id: string,
  input: {
    clarificationSentAt: Date
    clarificationMessageId?: string
    clarificationQuestions: string  // JSON array of questions
    clarificationContext?: string   // JSON object
  }
): Promise<FeedbackRecord> {
  const feedback = await prisma.feedback.update({
    where: { id },
    data: {
      status: 'clarification_requested',
      clarificationSentAt: input.clarificationSentAt,
      clarificationMessageId: input.clarificationMessageId,
      clarificationQuestions: input.clarificationQuestions,
      clarificationContext: input.clarificationContext,
    },
    include: {
      user: {
        select: { name: true, email: true },
      },
    },
  })

  return toFeedbackRecord(feedback)
}

/**
 * Complete clarification by recording answers and transitioning to changes_requested
 * Called when user responds to clarification questions
 */
export async function completeClarification(
  id: string,
  input: {
    clarificationAnswers: string
    responseReceivedAt: Date
    responseEmailId: string
    followUpIssueNumber?: number
    followUpIssueUrl?: string
  }
): Promise<FeedbackRecord> {
  const feedback = await prisma.feedback.update({
    where: { id },
    data: {
      status: 'changes_requested',
      clarificationAnswers: input.clarificationAnswers,
      responseReceivedAt: input.responseReceivedAt,
      responseEmailId: input.responseEmailId,
      followUpIssueNumber: input.followUpIssueNumber,
      followUpIssueUrl: input.followUpIssueUrl,
    },
    include: {
      user: {
        select: { name: true, email: true },
      },
    },
  })

  return toFeedbackRecord(feedback)
}

/**
 * Mark clarification as timed out
 * Used when no response received within timeout period
 */
export async function timeoutClarification(
  id: string,
  input: {
    followUpIssueNumber: number
    followUpIssueUrl: string
  }
): Promise<FeedbackRecord> {
  const feedback = await prisma.feedback.update({
    where: { id },
    data: {
      status: 'changes_requested',
      clarificationAnswers: '[TIMEOUT - No response received within 48 hours]',
      followUpIssueNumber: input.followUpIssueNumber,
      followUpIssueUrl: input.followUpIssueUrl,
    },
    include: {
      user: {
        select: { name: true, email: true },
      },
    },
  })

  return toFeedbackRecord(feedback)
}
