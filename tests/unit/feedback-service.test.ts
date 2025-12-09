/**
 * Unit tests for the feedback service
 *
 * Tests CRUD operations and data transformations.
 * Uses mocked Prisma client - no database required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma before importing service
vi.mock('@/lib/db', () => ({
  prisma: {
    feedback: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    emailMonitorState: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/db'
import {
  createFeedback,
  getFeedbackByIssueNumber,
  getFeedbackById,
  updateFeedbackStatus,
  getPendingFeedback,
  getResolvedFeedback,
  getLastCheckTime,
  updateLastCheckTime,
} from '@/services/feedback'
import type { FeedbackStatus } from '@/types/feedback'

// Type assertion for mocked prisma
const mockPrisma = prisma as unknown as {
  feedback: {
    create: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  emailMonitorState: {
    findUnique: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
  }
}

// Test fixtures
const mockDate = new Date('2025-12-09T12:00:00Z')
const mockUser = { name: 'Test User', email: 'test@example.com' }

const mockFeedbackDb = {
  id: 'feedback-123',
  userId: 'user-456',
  projectId: 'SkuInventoryDatabase',
  githubIssueNumber: 100,
  githubIssueUrl: 'https://github.com/org/repo/issues/100',
  status: 'pending' as const,
  notificationSentAt: null,
  notificationMessageId: null,
  responseReceivedAt: null,
  responseEmailId: null,
  responseContent: null,
  followUpIssueNumber: null,
  followUpIssueUrl: null,
  createdAt: mockDate,
  updatedAt: mockDate,
  user: mockUser,
}

describe('Feedback Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createFeedback', () => {
    it('creates a feedback record with pending status', async () => {
      mockPrisma.feedback.create.mockResolvedValue(mockFeedbackDb)

      const result = await createFeedback({
        userId: 'user-456',
        githubIssueNumber: 100,
        githubIssueUrl: 'https://github.com/org/repo/issues/100',
      })

      expect(mockPrisma.feedback.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-456',
          githubIssueNumber: 100,
          githubIssueUrl: 'https://github.com/org/repo/issues/100',
          projectId: 'SkuInventoryDatabase',
          status: 'pending',
        },
        include: {
          user: {
            select: { name: true, email: true },
          },
        },
      })

      expect(result.id).toBe('feedback-123')
      expect(result.status).toBe('pending')
      expect(result.userName).toBe('Test User')
      expect(result.userEmail).toBe('test@example.com')
    })

    it('converts Date fields to ISO strings', async () => {
      mockPrisma.feedback.create.mockResolvedValue(mockFeedbackDb)

      const result = await createFeedback({
        userId: 'user-456',
        githubIssueNumber: 100,
        githubIssueUrl: 'https://github.com/org/repo/issues/100',
      })

      expect(result.createdAt).toBe('2025-12-09T12:00:00.000Z')
      expect(result.updatedAt).toBe('2025-12-09T12:00:00.000Z')
    })

    it('stores projectId when provided', async () => {
      const feedbackWithProject = { ...mockFeedbackDb, projectId: 'NovusProjectDatabase' }
      mockPrisma.feedback.create.mockResolvedValue(feedbackWithProject)

      const result = await createFeedback({
        userId: 'user-456',
        githubIssueNumber: 100,
        githubIssueUrl: 'https://github.com/org/repo/issues/100',
        projectId: 'NovusProjectDatabase',
      })

      expect(mockPrisma.feedback.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectId: 'NovusProjectDatabase',
          }),
        })
      )
      expect(result.projectId).toBe('NovusProjectDatabase')
    })

    it('defaults projectId to SkuInventoryDatabase when not provided', async () => {
      mockPrisma.feedback.create.mockResolvedValue(mockFeedbackDb)

      await createFeedback({
        userId: 'user-456',
        githubIssueNumber: 100,
        githubIssueUrl: 'https://github.com/org/repo/issues/100',
      })

      expect(mockPrisma.feedback.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectId: 'SkuInventoryDatabase',
          }),
        })
      )
    })
  })

  describe('getFeedbackByIssueNumber', () => {
    it('returns feedback record when found', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(mockFeedbackDb)

      const result = await getFeedbackByIssueNumber(100)

      expect(mockPrisma.feedback.findUnique).toHaveBeenCalledWith({
        where: { githubIssueNumber: 100 },
        include: {
          user: {
            select: { name: true, email: true },
          },
        },
      })

      expect(result).not.toBeNull()
      expect(result?.githubIssueNumber).toBe(100)
    })

    it('returns null when not found', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(null)

      const result = await getFeedbackByIssueNumber(999)

      expect(result).toBeNull()
    })
  })

  describe('getFeedbackById', () => {
    it('returns feedback record when found', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(mockFeedbackDb)

      const result = await getFeedbackById('feedback-123')

      expect(mockPrisma.feedback.findUnique).toHaveBeenCalledWith({
        where: { id: 'feedback-123' },
        include: {
          user: {
            select: { name: true, email: true },
          },
        },
      })

      expect(result).not.toBeNull()
      expect(result?.id).toBe('feedback-123')
    })

    it('returns null when not found', async () => {
      mockPrisma.feedback.findUnique.mockResolvedValue(null)

      const result = await getFeedbackById('nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('updateFeedbackStatus', () => {
    it('updates status field', async () => {
      const updatedFeedback = { ...mockFeedbackDb, status: 'resolved' as const }
      mockPrisma.feedback.update.mockResolvedValue(updatedFeedback)

      const result = await updateFeedbackStatus('feedback-123', { status: 'resolved' })

      expect(mockPrisma.feedback.update).toHaveBeenCalledWith({
        where: { id: 'feedback-123' },
        data: { status: 'resolved' },
        include: {
          user: {
            select: { name: true, email: true },
          },
        },
      })

      expect(result.status).toBe('resolved')
    })

    it('updates notification fields', async () => {
      const notificationDate = new Date('2025-12-09T13:00:00Z')
      const updatedFeedback = {
        ...mockFeedbackDb,
        notificationSentAt: notificationDate,
        notificationMessageId: 'msg-789',
      }
      mockPrisma.feedback.update.mockResolvedValue(updatedFeedback)

      const result = await updateFeedbackStatus('feedback-123', {
        notificationSentAt: notificationDate,
        notificationMessageId: 'msg-789',
      })

      expect(result.notificationSentAt).toBe('2025-12-09T13:00:00.000Z')
      expect(result.notificationMessageId).toBe('msg-789')
    })

    it('updates follow-up issue fields', async () => {
      const updatedFeedback = {
        ...mockFeedbackDb,
        status: 'changes_requested' as const,
        followUpIssueNumber: 101,
        followUpIssueUrl: 'https://github.com/org/repo/issues/101',
      }
      mockPrisma.feedback.update.mockResolvedValue(updatedFeedback)

      const result = await updateFeedbackStatus('feedback-123', {
        status: 'changes_requested',
        followUpIssueNumber: 101,
        followUpIssueUrl: 'https://github.com/org/repo/issues/101',
      })

      expect(result.status).toBe('changes_requested')
      expect(result.followUpIssueNumber).toBe(101)
      expect(result.followUpIssueUrl).toBe('https://github.com/org/repo/issues/101')
    })
  })

  describe('getPendingFeedback', () => {
    it('returns array of pending feedback records', async () => {
      mockPrisma.feedback.findMany.mockResolvedValue([mockFeedbackDb])

      const result = await getPendingFeedback()

      expect(mockPrisma.feedback.findMany).toHaveBeenCalledWith({
        where: { status: 'pending' },
        include: {
          user: {
            select: { name: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      expect(result).toHaveLength(1)
      expect(result[0].status).toBe('pending')
    })

    it('returns empty array when no pending feedback', async () => {
      mockPrisma.feedback.findMany.mockResolvedValue([])

      const result = await getPendingFeedback()

      expect(result).toHaveLength(0)
    })
  })

  describe('getResolvedFeedback', () => {
    it('returns array of resolved feedback records', async () => {
      const resolvedFeedback = { ...mockFeedbackDb, status: 'resolved' as const }
      mockPrisma.feedback.findMany.mockResolvedValue([resolvedFeedback])

      const result = await getResolvedFeedback()

      expect(mockPrisma.feedback.findMany).toHaveBeenCalledWith({
        where: { status: 'resolved' },
        include: {
          user: {
            select: { name: true, email: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
      })

      expect(result).toHaveLength(1)
      expect(result[0].status).toBe('resolved')
    })
  })

  describe('Email Monitor State', () => {
    describe('getLastCheckTime', () => {
      it('returns stored time when state exists', async () => {
        const storedTime = new Date('2025-12-09T11:00:00Z')
        mockPrisma.emailMonitorState.findUnique.mockResolvedValue({
          id: 'singleton',
          lastCheckTime: storedTime,
          updatedAt: storedTime,
        })

        const result = await getLastCheckTime()

        expect(mockPrisma.emailMonitorState.findUnique).toHaveBeenCalledWith({
          where: { id: 'singleton' },
        })
        expect(result).toEqual(storedTime)
      })

      it('returns default time (15 min ago) when no state exists', async () => {
        mockPrisma.emailMonitorState.findUnique.mockResolvedValue(null)

        const before = Date.now()
        const result = await getLastCheckTime()
        const after = Date.now()

        // Should be approximately 15 minutes before now
        const fifteenMinMs = 15 * 60 * 1000
        expect(result.getTime()).toBeGreaterThanOrEqual(before - fifteenMinMs - 1000)
        expect(result.getTime()).toBeLessThanOrEqual(after - fifteenMinMs + 1000)
      })
    })

    describe('updateLastCheckTime', () => {
      it('upserts the singleton state record', async () => {
        const newTime = new Date('2025-12-09T12:30:00Z')
        mockPrisma.emailMonitorState.upsert.mockResolvedValue({
          id: 'singleton',
          lastCheckTime: newTime,
          updatedAt: newTime,
        })

        await updateLastCheckTime(newTime)

        expect(mockPrisma.emailMonitorState.upsert).toHaveBeenCalledWith({
          where: { id: 'singleton' },
          create: {
            id: 'singleton',
            lastCheckTime: newTime,
          },
          update: {
            lastCheckTime: newTime,
          },
        })
      })
    })
  })

  describe('Status Transitions', () => {
    it.each([
      ['pending', 'resolved'],
      ['resolved', 'verified'],
      ['resolved', 'changes_requested'],
    ] as const)('allows transition from %s to %s', async (from, to) => {
      const feedbackWithStatus = { ...mockFeedbackDb, status: to }
      mockPrisma.feedback.update.mockResolvedValue(feedbackWithStatus)

      const result = await updateFeedbackStatus('feedback-123', { status: to as FeedbackStatus })

      expect(result.status).toBe(to)
    })
  })
})
