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
          title: 'Button not working',
          expectedBehavior: 'The button should work when clicked',
          actualBehavior: 'The button does not respond',
          stepsToReproduce: '1. Click the button\n2. Nothing happens',
        }

        const result = await generateClarifyingQuestions(params)

        expect(result.questions).toHaveLength(2)
        expect(result.questions[0]).toBe('Does this issue happen every time, or only sometimes?')
        expect(result.questions[1]).toBe('Did this work correctly before, or is this the first time you tried?')
        expect(result.error).toBeUndefined()
      })

      it('returns fallback questions for feature type', async () => {
        const params: GenerateQuestionsParams = {
          type: 'feature',
          title: 'Dark mode for the application',
          whoBenefits: 'All Users',
          desiredAction: 'I want to toggle dark mode on/off',
          businessValue: 'Reduces eye strain during night usage',
        }

        const result = await generateClarifyingQuestions(params)

        expect(result.questions).toHaveLength(2)
        expect(result.questions[0]).toBe('How often would you use this feature?')
        expect(result.questions[1]).toBe('Would this integrate with any existing workflow?')
        expect(result.error).toBeUndefined()
      })
    })

    describe('fallback question content', () => {
      beforeEach(() => {
        delete process.env.ANTHROPIC_API_KEY
      })

      it('bug fallback questions focus on frequency and history', async () => {
        const params: GenerateQuestionsParams = {
          type: 'bug',
          title: 'Test bug title',
          expectedBehavior: 'Expected behavior text',
          actualBehavior: 'Actual behavior text',
          stepsToReproduce: 'Steps to reproduce',
        }

        const result = await generateClarifyingQuestions(params)

        expect(result.questions.some(q => q.toLowerCase().includes('every time'))).toBe(true)
        expect(result.questions.some(q => q.toLowerCase().includes('before'))).toBe(true)
      })

      it('feature fallback questions focus on frequency and workflow', async () => {
        const params: GenerateQuestionsParams = {
          type: 'feature',
          title: 'Test feature title',
          whoBenefits: 'Data Entry Staff',
          desiredAction: 'Desired action description',
          businessValue: 'Business value description',
        }

        const result = await generateClarifyingQuestions(params)

        expect(result.questions.some(q => q.toLowerCase().includes('often'))).toBe(true)
        expect(result.questions.some(q => q.toLowerCase().includes('workflow'))).toBe(true)
      })
    })

    describe('result structure', () => {
      beforeEach(() => {
        delete process.env.ANTHROPIC_API_KEY
      })

      it('returns 2-3 questions (fallback returns 2)', async () => {
        const params: GenerateQuestionsParams = {
          type: 'bug',
          title: 'Some bug description here',
          expectedBehavior: 'Expected behavior',
          actualBehavior: 'Actual behavior',
          stepsToReproduce: 'Steps here',
        }

        const result = await generateClarifyingQuestions(params)

        expect(result.questions.length).toBeGreaterThanOrEqual(2)
        expect(result.questions.length).toBeLessThanOrEqual(3)
      })

      it('returns questions as an array of strings', async () => {
        const params: GenerateQuestionsParams = {
          type: 'feature',
          title: 'Some feature description',
          whoBenefits: 'Analysts',
          desiredAction: 'Desired action here',
          businessValue: 'Business value here',
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
          title: 'Bug description for testing',
          expectedBehavior: 'Expected behavior',
          actualBehavior: 'Actual behavior',
          stepsToReproduce: 'Steps to reproduce',
        }

        const result = await generateClarifyingQuestions(params)

        result.questions.forEach(q => {
          expect(q.length).toBeGreaterThan(0)
        })
      })
    })
  })
})
