import { describe, it, expect } from 'vitest'
import {
  clarifyRequestSchema,
  submitFeedbackSchema,
  type FeedbackType,
  type FeedbackStep,
} from '@/types/feedback'

describe('Feedback Types', () => {
  describe('clarifyRequestSchema', () => {
    it('validates a valid bug clarify request', () => {
      const validRequest = {
        type: 'bug',
        description: 'This is a valid bug description that is long enough',
      }
      const result = clarifyRequestSchema.safeParse(validRequest)
      expect(result.success).toBe(true)
    })

    it('validates a valid feature clarify request', () => {
      const validRequest = {
        type: 'feature',
        description: 'This is a valid feature request description',
      }
      const result = clarifyRequestSchema.safeParse(validRequest)
      expect(result.success).toBe(true)
    })

    it('rejects description shorter than 10 characters', () => {
      const invalidRequest = {
        type: 'bug',
        description: 'Too short',
      }
      const result = clarifyRequestSchema.safeParse(invalidRequest)
      expect(result.success).toBe(false)
      if (!result.success) {
        // Zod flattens errors, check for the description field error
        const flattened = result.error.flatten()
        expect(flattened.fieldErrors.description).toBeDefined()
        expect(flattened.fieldErrors.description?.length).toBeGreaterThan(0)
      }
    })

    it('rejects invalid feedback type', () => {
      const invalidRequest = {
        type: 'invalid',
        description: 'This is a valid description length',
      }
      const result = clarifyRequestSchema.safeParse(invalidRequest)
      expect(result.success).toBe(false)
    })

    it('rejects missing type', () => {
      const invalidRequest = {
        description: 'This is a valid description length',
      }
      const result = clarifyRequestSchema.safeParse(invalidRequest)
      expect(result.success).toBe(false)
    })

    it('rejects missing description', () => {
      const invalidRequest = {
        type: 'bug',
      }
      const result = clarifyRequestSchema.safeParse(invalidRequest)
      expect(result.success).toBe(false)
    })
  })

  describe('submitFeedbackSchema', () => {
    it('validates a valid bug submission', () => {
      const validSubmission = {
        type: 'bug',
        description: 'This is a valid bug description',
        answers: ['Answer 1', 'Answer 2', 'Answer 3'],
      }
      const result = submitFeedbackSchema.safeParse(validSubmission)
      expect(result.success).toBe(true)
    })

    it('validates a valid feature submission', () => {
      const validSubmission = {
        type: 'feature',
        description: 'This is a valid feature description',
        answers: ['Answer 1', 'Answer 2', 'Answer 3'],
      }
      const result = submitFeedbackSchema.safeParse(validSubmission)
      expect(result.success).toBe(true)
    })

    it('rejects answers array with less than 3 items', () => {
      const invalidSubmission = {
        type: 'bug',
        description: 'This is a valid bug description',
        answers: ['Answer 1', 'Answer 2'],
      }
      const result = submitFeedbackSchema.safeParse(invalidSubmission)
      expect(result.success).toBe(false)
      if (!result.success) {
        // Zod flattens errors, check for the answers field error
        const flattened = result.error.flatten()
        expect(flattened.fieldErrors.answers).toBeDefined()
        expect(flattened.fieldErrors.answers?.length).toBeGreaterThan(0)
      }
    })

    it('rejects answers array with more than 3 items', () => {
      const invalidSubmission = {
        type: 'bug',
        description: 'This is a valid bug description',
        answers: ['Answer 1', 'Answer 2', 'Answer 3', 'Answer 4'],
      }
      const result = submitFeedbackSchema.safeParse(invalidSubmission)
      expect(result.success).toBe(false)
    })

    it('rejects missing answers', () => {
      const invalidSubmission = {
        type: 'bug',
        description: 'This is a valid bug description',
      }
      const result = submitFeedbackSchema.safeParse(invalidSubmission)
      expect(result.success).toBe(false)
    })

    it('rejects short description', () => {
      const invalidSubmission = {
        type: 'bug',
        description: 'Too short',
        answers: ['Answer 1', 'Answer 2', 'Answer 3'],
      }
      const result = submitFeedbackSchema.safeParse(invalidSubmission)
      expect(result.success).toBe(false)
    })
  })

  describe('FeedbackType', () => {
    it('allows bug type', () => {
      const type: FeedbackType = 'bug'
      expect(type).toBe('bug')
    })

    it('allows feature type', () => {
      const type: FeedbackType = 'feature'
      expect(type).toBe('feature')
    })
  })

  describe('FeedbackStep', () => {
    it('allows all valid steps', () => {
      const steps: FeedbackStep[] = ['select-type', 'describe', 'clarify', 'submitting', 'success', 'error']
      expect(steps).toHaveLength(6)
      expect(steps).toContain('select-type')
      expect(steps).toContain('describe')
      expect(steps).toContain('clarify')
      expect(steps).toContain('submitting')
      expect(steps).toContain('success')
      expect(steps).toContain('error')
    })
  })
})
