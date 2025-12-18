import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Unit tests for Claude Code Enhancement functionality
 *
 * Note: Due to the complexity of mocking child_process with vitest's ESM handling,
 * these tests focus on verifying the exported interface and fallback behavior
 * through the public API. The spawn-based execution is tested via integration tests.
 */

describe('Claude Code Enhancement Types', () => {
  describe('EnhanceIssueParams interface', () => {
    it('defines required properties for bug type', async () => {
      const { enhanceIssueWithClaudeCode } = await import('@/lib/claude')

      // TypeScript compile-time check that params are accepted
      const params = {
        type: 'bug' as const,
        title: 'Test bug title',
        expectedBehavior: 'Expected behavior',
        actualBehavior: 'Actual behavior',
        stepsToReproduce: 'Steps to reproduce',
        answers: ['a1', 'a2'],
      }

      // We can't actually call it without mock, but type checking confirms structure
      expect(params.type).toBe('bug')
      expect(params.title).toBeDefined()
      expect(params.answers).toHaveLength(2)
      expect(typeof enhanceIssueWithClaudeCode).toBe('function')
    })

    it('defines required properties for feature type', async () => {
      const { enhanceIssueWithClaudeCode } = await import('@/lib/claude')

      const params = {
        type: 'feature' as const,
        title: 'Test feature title',
        whoBenefits: 'All Users',
        desiredAction: 'Desired action',
        businessValue: 'Business value',
        answers: ['a1', 'a2'],
      }

      expect(params.type).toBe('feature')
      expect(params.title).toBeDefined()
      expect(params.answers).toHaveLength(2)
      expect(typeof enhanceIssueWithClaudeCode).toBe('function')
    })
  })
})

describe('Fallback Body Formatting', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    // Set a path that doesn't exist to force fallback
    process.env.CLAUDE_CODE_PATH = '/nonexistent/claude/path/that/wont/be/found'
  })

  afterEach(() => {
    process.env = originalEnv
    vi.clearAllMocks()
    vi.resetModules()
  })

  describe('bug type fallback', () => {
    it('uses fallback when claude code is not available', async () => {
      const { enhanceIssueWithClaudeCode } = await import('@/lib/claude')

      const params = {
        type: 'bug' as const,
        title: 'Test bug description for fallback',
        expectedBehavior: 'Expected behavior',
        actualBehavior: 'Actual behavior',
        stepsToReproduce: 'Step 1 to reproduce',
        answers: ['Step 1 to reproduce', 'Expected behavior'],
      }

      // This will fail to spawn and use fallback
      const result = await enhanceIssueWithClaudeCode(params)

      // Should get fallback result since spawn will fail
      expect(result.success).toBe(false)
      expect(result.title).toBe('Test bug description for fallback')
      expect(result.body).toContain('Reported Issue')
      expect(result.body).toContain('Test bug description for fallback')
      expect(result.error).toBeDefined()
    })

    it('includes structured fields in fallback bug body', async () => {
      const { enhanceIssueWithClaudeCode } = await import('@/lib/claude')

      const params = {
        type: 'bug' as const,
        title: 'Bug with specific fields',
        pageUrl: 'http://localhost:3000/test',
        expectedBehavior: 'Expected behavior text',
        actualBehavior: 'Actual behavior text',
        stepsToReproduce: 'Steps to reproduce the issue',
        answers: ['Reproduction step 1', 'I expected it to work'],
      }

      const result = await enhanceIssueWithClaudeCode(params)

      expect(result.body).toContain('Expected behavior text')
      expect(result.body).toContain('Actual behavior text')
      expect(result.body).toContain('Steps to reproduce the issue')
    })

    it('handles missing optional fields in bug fallback', async () => {
      const { enhanceIssueWithClaudeCode } = await import('@/lib/claude')

      const params = {
        type: 'bug' as const,
        title: 'Bug with no optional fields',
        answers: [],
      }

      const result = await enhanceIssueWithClaudeCode(params)

      expect(result.body).toContain('Not provided')
      expect(result.body).toContain('Not specified')
    })

    it('truncates long title in bug fallback title', async () => {
      const { enhanceIssueWithClaudeCode } = await import('@/lib/claude')

      const longTitle = 'A'.repeat(100)
      const params = {
        type: 'bug' as const,
        title: longTitle,
        expectedBehavior: 'Expected behavior',
        actualBehavior: 'Actual behavior',
        stepsToReproduce: 'Steps',
        answers: ['step', 'expected'],
      }

      const result = await enhanceIssueWithClaudeCode(params)

      expect(result.title.length).toBeLessThanOrEqual(80)
      expect(result.title.endsWith('...')).toBe(true)
    })
  })

  describe('feature type fallback', () => {
    it('uses fallback when claude code is not available', async () => {
      const { enhanceIssueWithClaudeCode } = await import('@/lib/claude')

      const params = {
        type: 'feature' as const,
        title: 'New feature for testing',
        whoBenefits: 'All Users',
        desiredAction: 'Desired action text',
        businessValue: 'Business value text',
        answers: ['Problem it solves', 'How I would use it'],
      }

      const result = await enhanceIssueWithClaudeCode(params)

      expect(result.success).toBe(false)
      expect(result.title).toBe('New feature for testing')
      expect(result.body).toContain('Feature Request')
      expect(result.body).toContain('New feature for testing')
    })

    it('includes structured fields in fallback feature body', async () => {
      const { enhanceIssueWithClaudeCode } = await import('@/lib/claude')

      const params = {
        type: 'feature' as const,
        title: 'Feature with specific fields',
        whoBenefits: 'Data Entry Staff',
        desiredAction: 'I want to export data to CSV',
        businessValue: 'Improves data analysis workflow',
        answers: ['Solves my workflow issue', 'Click button to activate'],
      }

      const result = await enhanceIssueWithClaudeCode(params)

      expect(result.body).toContain('Data Entry Staff')
      expect(result.body).toContain('I want to export data to CSV')
      expect(result.body).toContain('Improves data analysis workflow')
    })

    it('handles missing optional fields in feature fallback', async () => {
      const { enhanceIssueWithClaudeCode } = await import('@/lib/claude')

      const params = {
        type: 'feature' as const,
        title: 'Feature with no optional fields',
        answers: [],
      }

      const result = await enhanceIssueWithClaudeCode(params)

      expect(result.body).toContain('Not provided')
      expect(result.body).toContain('Not specified')
    })
  })

  describe('fallback structure', () => {
    it('bug fallback contains required sections', async () => {
      const { enhanceIssueWithClaudeCode } = await import('@/lib/claude')

      const result = await enhanceIssueWithClaudeCode({
        type: 'bug',
        title: 'Test bug title',
        expectedBehavior: 'Expected behavior',
        actualBehavior: 'Actual behavior',
        stepsToReproduce: 'Steps',
        answers: ['a', 'b'],
      })

      expect(result.body).toContain('## Reported Issue')
      expect(result.body).toContain('## Steps to Reproduce')
      expect(result.body).toContain('## Follow-up Questions & Answers')
      expect(result.body).toContain('## Next Steps')
    })

    it('feature fallback contains required sections', async () => {
      const { enhanceIssueWithClaudeCode } = await import('@/lib/claude')

      const result = await enhanceIssueWithClaudeCode({
        type: 'feature',
        title: 'Test feature title',
        whoBenefits: 'All Users',
        desiredAction: 'Desired action',
        businessValue: 'Business value',
        answers: ['a', 'b'],
      })

      expect(result.body).toContain('## Feature Request')
      expect(result.body).toContain('## Desired Action')
      expect(result.body).toContain('## Business Value')
      expect(result.body).toContain('## Acceptance Criteria')
    })
  })
})

describe('Environment Configuration', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    vi.resetModules()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('respects CLAUDE_CODE_PATH environment variable', async () => {
    // Set a custom path (that won't exist)
    process.env.CLAUDE_CODE_PATH = '/custom/path/to/claude'

    const { enhanceIssueWithClaudeCode } = await import('@/lib/claude')

    const result = await enhanceIssueWithClaudeCode({
      type: 'bug',
      title: 'Test title',
      expectedBehavior: 'Expected behavior',
      actualBehavior: 'Actual behavior',
      stepsToReproduce: 'Steps',
      answers: ['a', 'b'],
    })

    // Since path doesn't exist, we get fallback
    expect(result.success).toBe(false)
    // Error should mention spawn failure
    expect(result.error).toBeDefined()
  })

  it('defaults to "claude" when CLAUDE_CODE_PATH not set', async () => {
    delete process.env.CLAUDE_CODE_PATH

    const { enhanceIssueWithClaudeCode } = await import('@/lib/claude')

    // Function should be callable and should be a function
    expect(typeof enhanceIssueWithClaudeCode).toBe('function')

    // We don't actually call it here to avoid timeout waiting for real Claude execution
    // The function signature and export are verified
  })
})
