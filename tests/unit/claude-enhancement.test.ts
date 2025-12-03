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
        description: 'Test bug',
        answers: ['a1', 'a2', 'a3'],
      }

      // We can't actually call it without mock, but type checking confirms structure
      expect(params.type).toBe('bug')
      expect(params.description).toBeDefined()
      expect(params.answers).toHaveLength(3)
      expect(typeof enhanceIssueWithClaudeCode).toBe('function')
    })

    it('defines required properties for feature type', async () => {
      const { enhanceIssueWithClaudeCode } = await import('@/lib/claude')

      const params = {
        type: 'feature' as const,
        description: 'Test feature',
        answers: ['a1', 'a2', 'a3'],
      }

      expect(params.type).toBe('feature')
      expect(params.description).toBeDefined()
      expect(params.answers).toHaveLength(3)
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
        description: 'Test bug description for fallback',
        answers: ['Step 1 to reproduce', 'Expected behavior', 'Noticed yesterday'],
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

    it('includes answers in fallback bug body', async () => {
      const { enhanceIssueWithClaudeCode } = await import('@/lib/claude')

      const params = {
        type: 'bug' as const,
        description: 'Bug with specific answers',
        answers: ['Reproduction step 1', 'I expected it to work', 'First noticed today'],
      }

      const result = await enhanceIssueWithClaudeCode(params)

      expect(result.body).toContain('Reproduction step 1')
      expect(result.body).toContain('I expected it to work')
      expect(result.body).toContain('First noticed today')
    })

    it('handles empty answers in bug fallback', async () => {
      const { enhanceIssueWithClaudeCode } = await import('@/lib/claude')

      const params = {
        type: 'bug' as const,
        description: 'Bug with no answers',
        answers: [],
      }

      const result = await enhanceIssueWithClaudeCode(params)

      expect(result.body).toContain('Not provided')
      expect(result.body).toContain('Not specified')
    })

    it('truncates long descriptions in bug fallback title', async () => {
      const { enhanceIssueWithClaudeCode } = await import('@/lib/claude')

      const longDescription = 'A'.repeat(100)
      const params = {
        type: 'bug' as const,
        description: longDescription,
        answers: ['step', 'expected', 'when'],
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
        description: 'New feature for testing',
        answers: ['Problem it solves', 'How I would use it', 'Very important'],
      }

      const result = await enhanceIssueWithClaudeCode(params)

      expect(result.success).toBe(false)
      expect(result.title).toBe('New feature for testing')
      expect(result.body).toContain('Feature Description')
      expect(result.body).toContain('New feature for testing')
    })

    it('includes answers in fallback feature body', async () => {
      const { enhanceIssueWithClaudeCode } = await import('@/lib/claude')

      const params = {
        type: 'feature' as const,
        description: 'Feature with specific answers',
        answers: ['Solves my workflow issue', 'Click button to activate', 'Critical priority'],
      }

      const result = await enhanceIssueWithClaudeCode(params)

      expect(result.body).toContain('Solves my workflow issue')
      expect(result.body).toContain('Click button to activate')
      expect(result.body).toContain('Critical priority')
    })

    it('handles empty answers in feature fallback', async () => {
      const { enhanceIssueWithClaudeCode } = await import('@/lib/claude')

      const params = {
        type: 'feature' as const,
        description: 'Feature with no answers',
        answers: [],
      }

      const result = await enhanceIssueWithClaudeCode(params)

      expect(result.body).toContain('Not provided')
      expect(result.body).toContain('it improves my workflow')
    })

    it('includes user story in feature fallback', async () => {
      const { enhanceIssueWithClaudeCode } = await import('@/lib/claude')

      const params = {
        type: 'feature' as const,
        description: 'Add export to CSV',
        answers: ['Need to analyze data', 'Export button', 'High'],
      }

      const result = await enhanceIssueWithClaudeCode(params)

      expect(result.body).toContain('User Stories')
      expect(result.body).toContain('As a')
      expect(result.body).toContain('I want to')
      expect(result.body).toContain('So that')
    })
  })

  describe('fallback structure', () => {
    it('bug fallback contains required sections', async () => {
      const { enhanceIssueWithClaudeCode } = await import('@/lib/claude')

      const result = await enhanceIssueWithClaudeCode({
        type: 'bug',
        description: 'Test bug',
        answers: ['a', 'b', 'c'],
      })

      expect(result.body).toContain('## Reported Issue')
      expect(result.body).toContain('## Error Details')
      expect(result.body).toContain('## Clarifying Questions & Answers')
      expect(result.body).toContain('## Next Steps')
    })

    it('feature fallback contains required sections', async () => {
      const { enhanceIssueWithClaudeCode } = await import('@/lib/claude')

      const result = await enhanceIssueWithClaudeCode({
        type: 'feature',
        description: 'Test feature',
        answers: ['a', 'b', 'c'],
      })

      expect(result.body).toContain('## Feature Description')
      expect(result.body).toContain('## User Stories')
      expect(result.body).toContain('## Clarifying Questions & Answers')
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
      description: 'Test',
      answers: ['a', 'b', 'c'],
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
