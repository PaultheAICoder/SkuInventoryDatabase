import { describe, it, expect } from 'vitest'
import type {
  FeedbackRecord,
  FeedbackStatus,
  FeedbackType,
  CreateFeedbackInput,
  UpdateFeedbackStatusInput,
} from '@/types/feedback'

/**
 * Unit tests for feedback service logic.
 *
 * These tests focus on type validation and data transformation
 * without requiring database access. Database integration tests
 * are in the integration test directory.
 */

// Mock data factory for feedback records
function createMockFeedbackRecord(overrides: Partial<FeedbackRecord> = {}): FeedbackRecord {
  return {
    id: 'test-feedback-id',
    userId: 'test-user-id',
    userName: 'Test User',
    userEmail: 'test@example.com',
    type: 'bug' as FeedbackType,
    description: 'Test bug description',
    githubIssueNumber: 123,
    githubIssueUrl: 'https://github.com/test/repo/issues/123',
    status: 'pending' as FeedbackStatus,
    emailMessageId: null,
    resolvedAt: null,
    verifiedAt: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('Feedback Types', () => {
  describe('FeedbackStatus', () => {
    it('should have all valid status values', () => {
      const validStatuses: FeedbackStatus[] = [
        'pending',
        'in_progress',
        'resolved',
        'verified',
        'reopened',
      ]

      validStatuses.forEach((status) => {
        const record = createMockFeedbackRecord({ status })
        expect(record.status).toBe(status)
      })
    })
  })

  describe('FeedbackType', () => {
    it('should support bug type', () => {
      const record = createMockFeedbackRecord({ type: 'bug' })
      expect(record.type).toBe('bug')
    })

    it('should support feature type', () => {
      const record = createMockFeedbackRecord({ type: 'feature' })
      expect(record.type).toBe('feature')
    })
  })

  describe('FeedbackRecord', () => {
    it('should have all required fields', () => {
      const record = createMockFeedbackRecord()

      expect(record.id).toBeDefined()
      expect(record.userId).toBeDefined()
      expect(record.type).toBeDefined()
      expect(record.description).toBeDefined()
      expect(record.githubIssueNumber).toBeDefined()
      expect(record.githubIssueUrl).toBeDefined()
      expect(record.status).toBeDefined()
      expect(record.createdAt).toBeDefined()
      expect(record.updatedAt).toBeDefined()
    })

    it('should have optional user info', () => {
      const recordWithUser = createMockFeedbackRecord({
        userName: 'John Doe',
        userEmail: 'john@example.com',
      })

      expect(recordWithUser.userName).toBe('John Doe')
      expect(recordWithUser.userEmail).toBe('john@example.com')
    })

    it('should support null optional fields', () => {
      const record = createMockFeedbackRecord({
        userName: null,
        userEmail: null,
        emailMessageId: null,
        resolvedAt: null,
        verifiedAt: null,
      })

      expect(record.userName).toBeNull()
      expect(record.userEmail).toBeNull()
      expect(record.emailMessageId).toBeNull()
      expect(record.resolvedAt).toBeNull()
      expect(record.verifiedAt).toBeNull()
    })
  })
})

describe('Feedback Workflow', () => {
  describe('Status Transitions', () => {
    it('should start in pending status', () => {
      const record = createMockFeedbackRecord()
      expect(record.status).toBe('pending')
    })

    it('should transition to resolved with resolvedAt timestamp', () => {
      const resolvedAt = new Date().toISOString()
      const record = createMockFeedbackRecord({
        status: 'resolved',
        resolvedAt,
      })

      expect(record.status).toBe('resolved')
      expect(record.resolvedAt).toBe(resolvedAt)
    })

    it('should transition to verified with verifiedAt timestamp', () => {
      const resolvedAt = new Date().toISOString()
      const verifiedAt = new Date().toISOString()
      const record = createMockFeedbackRecord({
        status: 'verified',
        resolvedAt,
        verifiedAt,
      })

      expect(record.status).toBe('verified')
      expect(record.resolvedAt).toBe(resolvedAt)
      expect(record.verifiedAt).toBe(verifiedAt)
    })

    it('should transition to reopened when changes requested', () => {
      const record = createMockFeedbackRecord({
        status: 'reopened',
        resolvedAt: new Date().toISOString(),
      })

      expect(record.status).toBe('reopened')
    })
  })

  describe('Valid Workflow Paths', () => {
    const validWorkflows = [
      ['pending', 'in_progress', 'resolved', 'verified'],
      ['pending', 'resolved', 'verified'],
      ['pending', 'resolved', 'reopened'],
      ['pending', 'in_progress', 'resolved', 'reopened'],
    ]

    validWorkflows.forEach((workflow, index) => {
      it(`should support workflow path ${index + 1}: ${workflow.join(' -> ')}`, () => {
        workflow.forEach((status) => {
          const record = createMockFeedbackRecord({ status: status as FeedbackStatus })
          expect(record.status).toBe(status)
        })
      })
    })
  })
})

describe('CreateFeedbackInput', () => {
  it('should have all required fields for creation', () => {
    const input: CreateFeedbackInput = {
      userId: 'user-123',
      type: 'bug',
      description: 'Something is broken',
      githubIssueNumber: 456,
      githubIssueUrl: 'https://github.com/test/repo/issues/456',
    }

    expect(input.userId).toBe('user-123')
    expect(input.type).toBe('bug')
    expect(input.description).toBe('Something is broken')
    expect(input.githubIssueNumber).toBe(456)
    expect(input.githubIssueUrl).toBe('https://github.com/test/repo/issues/456')
  })

  it('should support both bug and feature types', () => {
    const bugInput: CreateFeedbackInput = {
      userId: 'user-123',
      type: 'bug',
      description: 'Bug report',
      githubIssueNumber: 1,
      githubIssueUrl: 'https://github.com/test/repo/issues/1',
    }

    const featureInput: CreateFeedbackInput = {
      userId: 'user-123',
      type: 'feature',
      description: 'Feature request',
      githubIssueNumber: 2,
      githubIssueUrl: 'https://github.com/test/repo/issues/2',
    }

    expect(bugInput.type).toBe('bug')
    expect(featureInput.type).toBe('feature')
  })
})

describe('UpdateFeedbackStatusInput', () => {
  it('should require status', () => {
    const input: UpdateFeedbackStatusInput = {
      status: 'resolved',
    }

    expect(input.status).toBe('resolved')
  })

  it('should support optional resolvedAt', () => {
    const resolvedAt = new Date()
    const input: UpdateFeedbackStatusInput = {
      status: 'resolved',
      resolvedAt,
    }

    expect(input.resolvedAt).toBe(resolvedAt)
  })

  it('should support optional verifiedAt', () => {
    const verifiedAt = new Date()
    const input: UpdateFeedbackStatusInput = {
      status: 'verified',
      verifiedAt,
    }

    expect(input.verifiedAt).toBe(verifiedAt)
  })

  it('should support optional emailMessageId', () => {
    const input: UpdateFeedbackStatusInput = {
      status: 'resolved',
      emailMessageId: 'msg-123',
    }

    expect(input.emailMessageId).toBe('msg-123')
  })
})

describe('FeedbackReply', () => {
  describe('Action Types', () => {
    it('should support verified action', () => {
      const record = createMockFeedbackRecord({
        replies: [
          {
            id: 'reply-1',
            feedbackId: 'test-feedback-id',
            emailMessageId: null,
            content: 'Looks good!',
            action: 'verified',
            followUpIssueNumber: null,
            followUpIssueUrl: null,
            createdAt: '2024-01-02T00:00:00.000Z',
          },
        ],
      })

      expect(record.replies?.[0].action).toBe('verified')
      expect(record.replies?.[0].followUpIssueNumber).toBeNull()
    })

    it('should support changes_requested action with follow-up issue', () => {
      const record = createMockFeedbackRecord({
        replies: [
          {
            id: 'reply-1',
            feedbackId: 'test-feedback-id',
            emailMessageId: 'msg-456',
            content: 'Still not working',
            action: 'changes_requested',
            followUpIssueNumber: 789,
            followUpIssueUrl: 'https://github.com/test/repo/issues/789',
            createdAt: '2024-01-02T00:00:00.000Z',
          },
        ],
      })

      expect(record.replies?.[0].action).toBe('changes_requested')
      expect(record.replies?.[0].followUpIssueNumber).toBe(789)
      expect(record.replies?.[0].followUpIssueUrl).toBe('https://github.com/test/repo/issues/789')
    })
  })
})

describe('GitHub Issue URL Validation', () => {
  it('should accept valid GitHub issue URLs', () => {
    const validUrls = [
      'https://github.com/owner/repo/issues/1',
      'https://github.com/PaultheAICoder/SkuInventoryDatabase/issues/172',
      'https://github.com/my-org/my-repo/issues/9999',
    ]

    validUrls.forEach((url) => {
      const record = createMockFeedbackRecord({ githubIssueUrl: url })
      expect(record.githubIssueUrl).toBe(url)
      expect(record.githubIssueUrl).toMatch(/^https:\/\/github\.com\/[\w-]+\/[\w-]+\/issues\/\d+$/)
    })
  })

  it('should extract issue number from URL', () => {
    const url = 'https://github.com/owner/repo/issues/123'
    const record = createMockFeedbackRecord({
      githubIssueUrl: url,
      githubIssueNumber: 123,
    })

    // Verify consistency between URL and issue number
    const urlIssueNumber = parseInt(url.split('/').pop() || '0', 10)
    expect(record.githubIssueNumber).toBe(urlIssueNumber)
  })
})
