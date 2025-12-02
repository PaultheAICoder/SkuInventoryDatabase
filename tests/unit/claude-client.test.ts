import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the Anthropic SDK before importing the module under test
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn(),
      },
    })),
  }
})

// Import after mocking
import { generateClarifyingQuestions, type GenerateQuestionsParams } from '@/lib/claude'

describe('Claude Client', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
    vi.clearAllMocks()
  })

  describe('generateClarifyingQuestions', () => {
    describe('when ANTHROPIC_API_KEY is not set', () => {
      beforeEach(() => {
        delete process.env.ANTHROPIC_API_KEY
      })

      it('returns fallback questions for bug type', async () => {
        const params: GenerateQuestionsParams = {
          type: 'bug',
          description: 'The button does not work when clicked',
        }

        const result = await generateClarifyingQuestions(params)

        expect(result.questions).toHaveLength(3)
        expect(result.questions[0]).toBe('What steps can we follow to reproduce this issue?')
        expect(result.questions[1]).toBe('What did you expect to happen instead?')
        expect(result.questions[2]).toBe('When did you first notice this problem?')
        expect(result.error).toBeUndefined()
      })

      it('returns fallback questions for feature type', async () => {
        const params: GenerateQuestionsParams = {
          type: 'feature',
          description: 'I want a dark mode for the application',
        }

        const result = await generateClarifyingQuestions(params)

        expect(result.questions).toHaveLength(3)
        expect(result.questions[0]).toBe('What problem would this feature solve for you?')
        expect(result.questions[1]).toBe('How would you ideally use this feature?')
        expect(result.questions[2]).toBe('How important is this feature to your workflow?')
        expect(result.error).toBeUndefined()
      })
    })

    describe('fallback question content', () => {
      beforeEach(() => {
        delete process.env.ANTHROPIC_API_KEY
      })

      it('bug fallback questions focus on reproduction and expected behavior', async () => {
        const params: GenerateQuestionsParams = {
          type: 'bug',
          description: 'Test description for bug',
        }

        const result = await generateClarifyingQuestions(params)

        expect(result.questions.some(q => q.toLowerCase().includes('reproduce'))).toBe(true)
        expect(result.questions.some(q => q.toLowerCase().includes('expect'))).toBe(true)
      })

      it('feature fallback questions focus on use cases and importance', async () => {
        const params: GenerateQuestionsParams = {
          type: 'feature',
          description: 'Test description for feature',
        }

        const result = await generateClarifyingQuestions(params)

        expect(result.questions.some(q => q.toLowerCase().includes('problem'))).toBe(true)
        expect(result.questions.some(q => q.toLowerCase().includes('important'))).toBe(true)
      })
    })

    describe('result structure', () => {
      beforeEach(() => {
        delete process.env.ANTHROPIC_API_KEY
      })

      it('always returns exactly 3 questions', async () => {
        const params: GenerateQuestionsParams = {
          type: 'bug',
          description: 'Some bug description here',
        }

        const result = await generateClarifyingQuestions(params)

        expect(result.questions).toHaveLength(3)
      })

      it('returns questions as an array of strings', async () => {
        const params: GenerateQuestionsParams = {
          type: 'feature',
          description: 'Some feature description here',
        }

        const result = await generateClarifyingQuestions(params)

        expect(Array.isArray(result.questions)).toBe(true)
        result.questions.forEach(q => {
          expect(typeof q).toBe('string')
        })
      })

      it('returns non-empty questions', async () => {
        const params: GenerateQuestionsParams = {
          type: 'bug',
          description: 'Bug description for testing',
        }

        const result = await generateClarifyingQuestions(params)

        result.questions.forEach(q => {
          expect(q.length).toBeGreaterThan(0)
        })
      })
    })
  })
})
