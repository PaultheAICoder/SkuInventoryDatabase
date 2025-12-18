import { describe, it, expect } from 'vitest'
import {
  clarifyRequestSchema,
  submitFeedbackSchema,
  type FeedbackType,
  type FeedbackStep,
  WHO_BENEFITS_OPTIONS,
} from '@/types/feedback'

describe('Feedback Types', () => {
  describe('clarifyRequestSchema', () => {
    it('validates a valid bug clarify request with all fields', () => {
      const validRequest = {
        type: 'bug',
        title: 'Button not working on dashboard',
        pageUrl: 'http://localhost:3000/dashboard',
        expectedBehavior: 'The button should submit the form when clicked',
        actualBehavior: 'The button does nothing when clicked',
        stepsToReproduce: '1. Go to dashboard\n2. Click button\n3. Nothing happens',
      }
      const result = clarifyRequestSchema.safeParse(validRequest)
      expect(result.success).toBe(true)
    })

    it('validates a valid feature clarify request with all fields', () => {
      const validRequest = {
        type: 'feature',
        title: 'Add dark mode support',
        pageUrl: 'http://localhost:3000/settings',
        whoBenefits: 'All Users',
        desiredAction: 'I want to toggle dark mode on/off from the settings page',
        businessValue: 'Reduces eye strain during night usage, improves accessibility',
      }
      const result = clarifyRequestSchema.safeParse(validRequest)
      expect(result.success).toBe(true)
    })

    it('validates request with minimal required fields', () => {
      const minimalRequest = {
        type: 'bug',
        title: 'Short title here',
      }
      const result = clarifyRequestSchema.safeParse(minimalRequest)
      expect(result.success).toBe(true)
    })

    it('rejects title shorter than 5 characters', () => {
      const invalidRequest = {
        type: 'bug',
        title: 'Bug',
      }
      const result = clarifyRequestSchema.safeParse(invalidRequest)
      expect(result.success).toBe(false)
      if (!result.success) {
        const flattened = result.error.flatten()
        expect(flattened.fieldErrors.title).toBeDefined()
        expect(flattened.fieldErrors.title?.length).toBeGreaterThan(0)
      }
    })

    it('rejects invalid feedback type', () => {
      const invalidRequest = {
        type: 'invalid',
        title: 'Valid title for invalid type',
      }
      const result = clarifyRequestSchema.safeParse(invalidRequest)
      expect(result.success).toBe(false)
    })

    it('rejects missing type', () => {
      const invalidRequest = {
        title: 'Valid title without type',
      }
      const result = clarifyRequestSchema.safeParse(invalidRequest)
      expect(result.success).toBe(false)
    })

    it('rejects missing title', () => {
      const invalidRequest = {
        type: 'bug',
      }
      const result = clarifyRequestSchema.safeParse(invalidRequest)
      expect(result.success).toBe(false)
    })

    it('validates optional pageUrl as valid URL', () => {
      const validRequest = {
        type: 'bug',
        title: 'Valid bug title',
        pageUrl: 'http://localhost:3000/test',
      }
      const result = clarifyRequestSchema.safeParse(validRequest)
      expect(result.success).toBe(true)
    })

    it('rejects invalid pageUrl format', () => {
      const invalidRequest = {
        type: 'bug',
        title: 'Valid bug title',
        pageUrl: 'not-a-valid-url',
      }
      const result = clarifyRequestSchema.safeParse(invalidRequest)
      expect(result.success).toBe(false)
    })
  })

  describe('submitFeedbackSchema', () => {
    it('validates a valid bug submission with 2 answers', () => {
      const validSubmission = {
        type: 'bug',
        title: 'Valid bug title here',
        expectedBehavior: 'Expected behavior text',
        actualBehavior: 'Actual behavior text',
        stepsToReproduce: 'Steps to reproduce',
        answers: ['Answer 1', 'Answer 2'],
      }
      const result = submitFeedbackSchema.safeParse(validSubmission)
      expect(result.success).toBe(true)
    })

    it('validates a valid bug submission with 3 answers', () => {
      const validSubmission = {
        type: 'bug',
        title: 'Valid bug title here',
        answers: ['Answer 1', 'Answer 2', 'Answer 3'],
      }
      const result = submitFeedbackSchema.safeParse(validSubmission)
      expect(result.success).toBe(true)
    })

    it('validates a valid feature submission with 2 answers', () => {
      const validSubmission = {
        type: 'feature',
        title: 'Valid feature title',
        whoBenefits: 'All Users',
        desiredAction: 'I want to do this action',
        businessValue: 'This is important because...',
        answers: ['Answer 1', 'Answer 2'],
      }
      const result = submitFeedbackSchema.safeParse(validSubmission)
      expect(result.success).toBe(true)
    })

    it('rejects answers array with less than 2 items', () => {
      const invalidSubmission = {
        type: 'bug',
        title: 'Valid bug title here',
        answers: ['Answer 1'],
      }
      const result = submitFeedbackSchema.safeParse(invalidSubmission)
      expect(result.success).toBe(false)
      if (!result.success) {
        const flattened = result.error.flatten()
        expect(flattened.fieldErrors.answers).toBeDefined()
        expect(flattened.fieldErrors.answers?.length).toBeGreaterThan(0)
      }
    })

    it('rejects answers array with more than 3 items', () => {
      const invalidSubmission = {
        type: 'bug',
        title: 'Valid bug title here',
        answers: ['Answer 1', 'Answer 2', 'Answer 3', 'Answer 4'],
      }
      const result = submitFeedbackSchema.safeParse(invalidSubmission)
      expect(result.success).toBe(false)
    })

    it('rejects missing answers', () => {
      const invalidSubmission = {
        type: 'bug',
        title: 'Valid bug title here',
      }
      const result = submitFeedbackSchema.safeParse(invalidSubmission)
      expect(result.success).toBe(false)
    })

    it('rejects short title', () => {
      const invalidSubmission = {
        type: 'bug',
        title: 'Bug',
        answers: ['Answer 1', 'Answer 2'],
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
      const steps: FeedbackStep[] = ['select-type', 'structured-fields', 'clarify', 'submitting', 'success', 'error']
      expect(steps).toHaveLength(6)
      expect(steps).toContain('select-type')
      expect(steps).toContain('structured-fields')
      expect(steps).toContain('clarify')
      expect(steps).toContain('submitting')
      expect(steps).toContain('success')
      expect(steps).toContain('error')
    })
  })

  describe('WHO_BENEFITS_OPTIONS', () => {
    it('contains all expected options', () => {
      expect(WHO_BENEFITS_OPTIONS).toContain('All Users')
      expect(WHO_BENEFITS_OPTIONS).toContain('Administrators')
      expect(WHO_BENEFITS_OPTIONS).toContain('Data Entry Staff')
      expect(WHO_BENEFITS_OPTIONS).toContain('Analysts')
      expect(WHO_BENEFITS_OPTIONS).toContain('Other')
    })

    it('has exactly 5 options', () => {
      expect(WHO_BENEFITS_OPTIONS).toHaveLength(5)
    })
  })
})
