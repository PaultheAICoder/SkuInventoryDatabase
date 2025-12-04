/**
 * Feedback Service
 *
 * Handles feedback tracking operations including:
 * - Creating feedback records linked to GitHub issues
 * - Updating feedback status through the resolution workflow
 * - Recording user replies (verification or change requests)
 */

import { prisma } from '@/lib/db'
import { Octokit } from '@octokit/rest'
import { parseReplyDecision } from './email-parsing'
import type {
  FeedbackRecord,
  FeedbackReplyRecord,
  CreateFeedbackInput,
  UpdateFeedbackStatusInput,
  FeedbackStatus,
  FeedbackReplyAction,
  FeedbackType,
} from '@/types/feedback'

// GitHub configuration for follow-up issues
const GITHUB_OWNER = 'PaultheAICoder'
const GITHUB_REPO = 'SkuInventoryDatabase'

/**
 * Create a new feedback record
 */
export async function createFeedback(input: CreateFeedbackInput): Promise<FeedbackRecord> {
  const feedback = await prisma.feedback.create({
    data: {
      userId: input.userId,
      type: input.type,
      description: input.description,
      githubIssueNumber: input.githubIssueNumber,
      githubIssueUrl: input.githubIssueUrl,
      status: 'pending',
    },
    include: {
      user: {
        select: { name: true, email: true },
      },
    },
  })

  return {
    id: feedback.id,
    userId: feedback.userId,
    userName: feedback.user.name,
    userEmail: feedback.user.email,
    type: feedback.type as FeedbackType,
    description: feedback.description,
    githubIssueNumber: feedback.githubIssueNumber,
    githubIssueUrl: feedback.githubIssueUrl,
    status: feedback.status as FeedbackStatus,
    emailMessageId: feedback.emailMessageId,
    resolvedAt: feedback.resolvedAt?.toISOString() ?? null,
    verifiedAt: feedback.verifiedAt?.toISOString() ?? null,
    createdAt: feedback.createdAt.toISOString(),
    updatedAt: feedback.updatedAt.toISOString(),
  }
}

/**
 * Get feedback by GitHub issue number
 */
export async function getFeedbackByIssueNumber(
  issueNumber: number
): Promise<FeedbackRecord | null> {
  const feedback = await prisma.feedback.findFirst({
    where: { githubIssueNumber: issueNumber },
    include: {
      user: {
        select: { name: true, email: true },
      },
      replies: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!feedback) return null

  return {
    id: feedback.id,
    userId: feedback.userId,
    userName: feedback.user.name,
    userEmail: feedback.user.email,
    type: feedback.type as FeedbackType,
    description: feedback.description,
    githubIssueNumber: feedback.githubIssueNumber,
    githubIssueUrl: feedback.githubIssueUrl,
    status: feedback.status as FeedbackStatus,
    emailMessageId: feedback.emailMessageId,
    resolvedAt: feedback.resolvedAt?.toISOString() ?? null,
    verifiedAt: feedback.verifiedAt?.toISOString() ?? null,
    createdAt: feedback.createdAt.toISOString(),
    updatedAt: feedback.updatedAt.toISOString(),
    replies: feedback.replies.map((r) => ({
      id: r.id,
      feedbackId: r.feedbackId,
      emailMessageId: r.emailMessageId,
      content: r.content,
      action: r.action as FeedbackReplyAction,
      followUpIssueNumber: r.followUpIssueNumber,
      followUpIssueUrl: r.followUpIssueUrl,
      createdAt: r.createdAt.toISOString(),
    })),
  }
}

/**
 * Get feedback by ID
 */
export async function getFeedbackById(feedbackId: string): Promise<FeedbackRecord | null> {
  const feedback = await prisma.feedback.findUnique({
    where: { id: feedbackId },
    include: {
      user: {
        select: { name: true, email: true },
      },
      replies: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!feedback) return null

  return {
    id: feedback.id,
    userId: feedback.userId,
    userName: feedback.user.name,
    userEmail: feedback.user.email,
    type: feedback.type as FeedbackType,
    description: feedback.description,
    githubIssueNumber: feedback.githubIssueNumber,
    githubIssueUrl: feedback.githubIssueUrl,
    status: feedback.status as FeedbackStatus,
    emailMessageId: feedback.emailMessageId,
    resolvedAt: feedback.resolvedAt?.toISOString() ?? null,
    verifiedAt: feedback.verifiedAt?.toISOString() ?? null,
    createdAt: feedback.createdAt.toISOString(),
    updatedAt: feedback.updatedAt.toISOString(),
    replies: feedback.replies.map((r) => ({
      id: r.id,
      feedbackId: r.feedbackId,
      emailMessageId: r.emailMessageId,
      content: r.content,
      action: r.action as FeedbackReplyAction,
      followUpIssueNumber: r.followUpIssueNumber,
      followUpIssueUrl: r.followUpIssueUrl,
      createdAt: r.createdAt.toISOString(),
    })),
  }
}

/**
 * Update feedback status
 */
export async function updateFeedbackStatus(
  feedbackId: string,
  input: UpdateFeedbackStatusInput
): Promise<FeedbackRecord> {
  const feedback = await prisma.feedback.update({
    where: { id: feedbackId },
    data: {
      status: input.status,
      ...(input.resolvedAt && { resolvedAt: input.resolvedAt }),
      ...(input.verifiedAt && { verifiedAt: input.verifiedAt }),
      ...(input.emailMessageId && { emailMessageId: input.emailMessageId }),
    },
    include: {
      user: {
        select: { name: true, email: true },
      },
    },
  })

  return {
    id: feedback.id,
    userId: feedback.userId,
    userName: feedback.user.name,
    userEmail: feedback.user.email,
    type: feedback.type as FeedbackType,
    description: feedback.description,
    githubIssueNumber: feedback.githubIssueNumber,
    githubIssueUrl: feedback.githubIssueUrl,
    status: feedback.status as FeedbackStatus,
    emailMessageId: feedback.emailMessageId,
    resolvedAt: feedback.resolvedAt?.toISOString() ?? null,
    verifiedAt: feedback.verifiedAt?.toISOString() ?? null,
    createdAt: feedback.createdAt.toISOString(),
    updatedAt: feedback.updatedAt.toISOString(),
  }
}

/**
 * Get user's feedback history
 */
export async function getUserFeedback(userId: string): Promise<FeedbackRecord[]> {
  const feedbacks = await prisma.feedback.findMany({
    where: { userId },
    include: {
      user: {
        select: { name: true, email: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return feedbacks.map((f) => ({
    id: f.id,
    userId: f.userId,
    userName: f.user.name,
    userEmail: f.user.email,
    type: f.type as FeedbackType,
    description: f.description,
    githubIssueNumber: f.githubIssueNumber,
    githubIssueUrl: f.githubIssueUrl,
    status: f.status as FeedbackStatus,
    emailMessageId: f.emailMessageId,
    resolvedAt: f.resolvedAt?.toISOString() ?? null,
    verifiedAt: f.verifiedAt?.toISOString() ?? null,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  }))
}

/**
 * Create a feedback reply record
 */
export async function createFeedbackReply(
  feedbackId: string,
  input: {
    emailMessageId?: string
    content: string
    action: FeedbackReplyAction
    followUpIssueNumber?: number
    followUpIssueUrl?: string
  }
): Promise<FeedbackReplyRecord> {
  const reply = await prisma.feedbackReply.create({
    data: {
      feedbackId,
      emailMessageId: input.emailMessageId ?? null,
      content: input.content,
      action: input.action,
      followUpIssueNumber: input.followUpIssueNumber ?? null,
      followUpIssueUrl: input.followUpIssueUrl ?? null,
    },
  })

  return {
    id: reply.id,
    feedbackId: reply.feedbackId,
    emailMessageId: reply.emailMessageId,
    content: reply.content,
    action: reply.action as FeedbackReplyAction,
    followUpIssueNumber: reply.followUpIssueNumber,
    followUpIssueUrl: reply.followUpIssueUrl,
    createdAt: reply.createdAt.toISOString(),
  }
}

/**
 * Get all feedback in resolved status awaiting verification
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
    orderBy: { resolvedAt: 'desc' },
  })

  return feedbacks.map((f) => ({
    id: f.id,
    userId: f.userId,
    userName: f.user.name,
    userEmail: f.user.email,
    type: f.type as FeedbackType,
    description: f.description,
    githubIssueNumber: f.githubIssueNumber,
    githubIssueUrl: f.githubIssueUrl,
    status: f.status as FeedbackStatus,
    emailMessageId: f.emailMessageId,
    resolvedAt: f.resolvedAt?.toISOString() ?? null,
    verifiedAt: f.verifiedAt?.toISOString() ?? null,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  }))
}

// ============================================
// Email Reply Processing
// ============================================

/**
 * Result of processing an email reply
 */
export interface ProcessEmailReplyResult {
  action: 'verified' | 'changes_requested' | 'unknown'
  followUpIssue?: {
    number: number
    url: string
  }
}

/**
 * Process an email reply for feedback
 *
 * Parses the email body to determine user intent (verified or changes_requested),
 * updates the feedback status, and creates a follow-up issue if needed.
 *
 * @param feedback - The feedback record to process the reply for
 * @param emailBody - Raw email body content
 * @param emailMessageId - Optional email message ID for tracking
 * @returns Processing result with action taken
 */
export async function processEmailReply(
  feedback: FeedbackRecord,
  emailBody: string,
  emailMessageId?: string
): Promise<ProcessEmailReplyResult> {
  const { action, cleanedBody, confidence } = parseReplyDecision(emailBody)

  console.log(`[Feedback] Processing email reply for feedback ${feedback.id}`)
  console.log(`[Feedback] Parsed action: ${action}, confidence: ${confidence}`)

  if (!action) {
    console.log(`[Feedback] Could not determine action from reply for feedback ${feedback.id}`)
    return { action: 'unknown' }
  }

  if (action === 'verified') {
    // Mark as verified
    await updateFeedbackStatus(feedback.id, {
      status: 'verified',
      verifiedAt: new Date(),
    })

    await createFeedbackReply(feedback.id, {
      emailMessageId,
      content: cleanedBody,
      action: 'verified',
    })

    console.log(`[Feedback] Marked feedback ${feedback.id} as verified`)
    return { action: 'verified' }
  }

  if (action === 'changes_requested') {
    // Create follow-up GitHub issue
    const githubToken = process.env.GITHUB_API_TOKEN
    if (!githubToken) {
      console.error('[Feedback] GITHUB_API_TOKEN not configured, cannot create follow-up issue')
      throw new Error('GITHUB_API_TOKEN not configured')
    }

    const octokit = new Octokit({ auth: githubToken })

    const { data: issue } = await octokit.issues.create({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      title: `[Follow-up] Re: Issue #${feedback.githubIssueNumber} - Changes Requested`,
      body: `## Follow-up to Issue #${feedback.githubIssueNumber}

**Original Issue**: ${feedback.githubIssueUrl}
**Submitter**: User requested additional changes

### User Feedback
${cleanedBody}

### Original Description
${feedback.description}

---
*This issue was automatically created from an email reply.*`,
      labels: [feedback.type === 'bug' ? 'bug' : 'enhancement', 'follow-up'],
    })

    console.log(`[Feedback] Created follow-up issue #${issue.number}`)

    // Update feedback status
    await updateFeedbackStatus(feedback.id, {
      status: 'reopened',
    })

    // Record the reply
    await createFeedbackReply(feedback.id, {
      emailMessageId,
      content: cleanedBody,
      action: 'changes_requested',
      followUpIssueNumber: issue.number,
      followUpIssueUrl: issue.html_url,
    })

    console.log(`[Feedback] Marked feedback ${feedback.id} as reopened`)

    return {
      action: 'changes_requested',
      followUpIssue: {
        number: issue.number,
        url: issue.html_url,
      },
    }
  }

  return { action: 'unknown' }
}
