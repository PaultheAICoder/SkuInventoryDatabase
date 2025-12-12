/**
 * Completion Report Parser Service
 *
 * Reads and parses completion reports from completion-docs/ directory
 * and agent outputs from .agents/outputs/ to extract context about
 * what was implemented for a given issue.
 *
 * Used to generate context-specific clarification questions when
 * users report that a fix didn't work.
 */

import { promises as fs } from 'fs'
import path from 'path'
import type { ClarificationContext } from '@/types/feedback'

// Project root directory
const PROJECT_ROOT = process.cwd()

/**
 * Find completion report for a given issue number
 * Pattern: completion-docs/*-issue-XXX-*.md
 *
 * @param issueNumber - GitHub issue number to find report for
 * @returns Path to completion report or null if not found
 */
export async function findCompletionReport(issueNumber: number): Promise<string | null> {
  const completionDocsDir = path.join(PROJECT_ROOT, 'completion-docs')

  try {
    const files = await fs.readdir(completionDocsDir)

    // Look for files matching the pattern *-issue-XXX-*.md
    const pattern = new RegExp(`-issue-${issueNumber}-.*\\.md$`, 'i')
    const matchingFile = files.find((file) => pattern.test(file))

    if (matchingFile) {
      return path.join(completionDocsDir, matchingFile)
    }

    // Also try pattern like *-issue-XXX.md (without trailing description)
    const simplePattern = new RegExp(`-issue-${issueNumber}\\.md$`, 'i')
    const simpleMatch = files.find((file) => simplePattern.test(file))

    if (simpleMatch) {
      return path.join(completionDocsDir, simpleMatch)
    }

    return null
  } catch (error) {
    console.error(`[Completion Report] Error finding report for issue #${issueNumber}:`, error)
    return null
  }
}

/**
 * Parsed structure from completion report
 */
export interface ParsedCompletionReport {
  executiveSummary?: string
  filesModified: Array<{
    path: string
    changeType: 'created' | 'modified'
    description?: string
  }>
  rootCause?: string
  whatWasAccomplished: string[]
  testsAdded?: string[]
  acceptanceCriteria: Array<{
    criteria: string
    status: 'done' | 'pending'
  }>
  knownLimitations?: string[]
}

/**
 * Parse completion report to extract key context
 *
 * @param reportPath - Path to the completion report markdown file
 * @returns Parsed completion report data
 */
export async function parseCompletionReport(reportPath: string): Promise<ParsedCompletionReport> {
  const result: ParsedCompletionReport = {
    filesModified: [],
    whatWasAccomplished: [],
    acceptanceCriteria: [],
  }

  try {
    const content = await fs.readFile(reportPath, 'utf-8')
    const lines = content.split('\n')

    let currentSection = ''
    let inFilesSection = false
    let inAccomplishedSection = false

    for (const line of lines) {
      const trimmed = line.trim()

      // Detect section headers
      if (trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
        currentSection = trimmed.toLowerCase()
        inFilesSection = currentSection.includes('files') && (currentSection.includes('modified') || currentSection.includes('created') || currentSection.includes('changed'))
        inAccomplishedSection = currentSection.includes('accomplished') || currentSection.includes('what was')
        continue
      }

      // Extract executive summary (first paragraph after Executive Summary header)
      if (currentSection.includes('executive summary') && trimmed && !result.executiveSummary) {
        result.executiveSummary = trimmed
      }

      // Extract files modified/created
      if (inFilesSection && trimmed.startsWith('-')) {
        // Pattern: - `path/to/file.ts` - Description
        const fileMatch = trimmed.match(/^-\s*[`*]?([^`*]+)[`*]?\s*[-–]?\s*(.*)$/)
        if (fileMatch) {
          const filePath = fileMatch[1].trim()
          const description = fileMatch[2]?.trim() || undefined

          // Skip if it looks like a directory or doesn't have a file extension
          if (filePath.includes('.') && !filePath.endsWith('/')) {
            result.filesModified.push({
              path: filePath,
              changeType: currentSection.includes('created') ? 'created' : 'modified',
              description,
            })
          }
        }
      }

      // Extract what was accomplished
      if (inAccomplishedSection && trimmed.startsWith('-')) {
        const item = trimmed.replace(/^-\s*/, '').trim()
        if (item) {
          result.whatWasAccomplished.push(item)
        }
      }

      // Extract root cause
      if (currentSection.includes('root cause') && trimmed && !result.rootCause) {
        result.rootCause = trimmed
      }

      // Extract acceptance criteria
      if (currentSection.includes('acceptance') && trimmed.match(/^-\s*\[[ x]\]/i)) {
        const isChecked = trimmed.includes('[x]') || trimmed.includes('[X]')
        const criteria = trimmed.replace(/^-\s*\[[ xX]\]\s*/, '').trim()
        result.acceptanceCriteria.push({
          criteria,
          status: isChecked ? 'done' : 'pending',
        })
      }

      // Extract tests added (look for .spec.ts or .test.ts files in files section)
      if (inFilesSection && (trimmed.includes('.spec.ts') || trimmed.includes('.test.ts'))) {
        const testMatch = trimmed.match(/[`*]?([^`*\s]+(?:\.spec|\.test)\.tsx?)[`*]?/)
        if (testMatch) {
          if (!result.testsAdded) result.testsAdded = []
          result.testsAdded.push(testMatch[1])
        }
      }

      // Extract known limitations
      if (currentSection.includes('limitation') && trimmed.startsWith('-')) {
        const limitation = trimmed.replace(/^-\s*/, '').trim()
        if (limitation) {
          if (!result.knownLimitations) result.knownLimitations = []
          result.knownLimitations.push(limitation)
        }
      }
    }

    return result
  } catch (error) {
    console.error(`[Completion Report] Error parsing report ${reportPath}:`, error)
    return result
  }
}

/**
 * Find agent outputs for an issue (plan, build, cleanup)
 * Pattern: .agents/outputs/{plan|build|cleanup}-XXX-*.md
 *
 * @param issueNumber - GitHub issue number
 * @returns Paths to plan, build, and cleanup outputs
 */
export async function findAgentOutputs(issueNumber: number): Promise<{
  plan?: string
  build?: string
  cleanup?: string
}> {
  const outputsDir = path.join(PROJECT_ROOT, '.agents', 'outputs')
  const result: { plan?: string; build?: string; cleanup?: string } = {}

  try {
    const files = await fs.readdir(outputsDir)

    // Look for files matching pattern: {phase}-{issueNumber}-*.md
    for (const file of files) {
      if (file.startsWith(`plan-${issueNumber}-`) && file.endsWith('.md')) {
        result.plan = path.join(outputsDir, file)
      } else if (file.startsWith(`build-${issueNumber}-`) && file.endsWith('.md')) {
        result.build = path.join(outputsDir, file)
      } else if (file.startsWith(`cleanup-${issueNumber}-`) && file.endsWith('.md')) {
        result.cleanup = path.join(outputsDir, file)
      }
    }

    return result
  } catch (error) {
    console.error(`[Completion Report] Error finding agent outputs for issue #${issueNumber}:`, error)
    return result
  }
}

/**
 * Extract a brief summary from agent plan output
 */
async function extractPlanSummary(planPath: string): Promise<string | undefined> {
  try {
    const content = await fs.readFile(planPath, 'utf-8')

    // Look for executive summary or first substantial paragraph
    const summaryMatch = content.match(/##\s*(?:Executive\s*)?Summary[\s\S]*?\n\n([\s\S]*?)(?:\n\n|$)/i)
    if (summaryMatch) {
      return summaryMatch[1].trim().substring(0, 500)
    }

    // Fall back to first non-header paragraph
    const lines = content.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('-') && trimmed.length > 50) {
        return trimmed.substring(0, 500)
      }
    }

    return undefined
  } catch {
    return undefined
  }
}

/**
 * Extract implementation context from completion reports and agent outputs
 * for a given issue number.
 *
 * @param issueNumber - GitHub issue number
 * @param originalTitle - Original issue title (optional, for context)
 * @returns Combined context from all available sources
 */
export async function extractImplementationContext(
  issueNumber: number,
  originalTitle?: string
): Promise<ClarificationContext> {
  const context: ClarificationContext = {
    originalIssueNumber: issueNumber,
    originalTitle: originalTitle || `Issue #${issueNumber}`,
    filesModified: [],
  }

  // Try to find and parse completion report
  const completionReportPath = await findCompletionReport(issueNumber)
  if (completionReportPath) {
    context.completionReportPath = completionReportPath

    const parsed = await parseCompletionReport(completionReportPath)

    // Copy files modified
    context.filesModified = parsed.filesModified

    // Copy root cause if found
    if (parsed.rootCause) {
      context.rootCauseIdentified = parsed.rootCause
    }

    // Copy tests added
    if (parsed.testsAdded && parsed.testsAdded.length > 0) {
      context.testsAdded = parsed.testsAdded
    }

    // Copy what was accomplished
    if (parsed.whatWasAccomplished.length > 0) {
      context.whatWasAccomplished = parsed.whatWasAccomplished
    }

    // Generate fix description from executive summary or accomplished items
    if (parsed.executiveSummary) {
      context.fixDescription = parsed.executiveSummary
    } else if (parsed.whatWasAccomplished.length > 0) {
      context.fixDescription = parsed.whatWasAccomplished.slice(0, 3).join('. ')
    }
  }

  // Try to find agent outputs for additional context
  const agentOutputs = await findAgentOutputs(issueNumber)

  // Extract summary from plan if no fix description yet
  if (!context.fixDescription && agentOutputs.plan) {
    const planSummary = await extractPlanSummary(agentOutputs.plan)
    if (planSummary) {
      context.fixDescription = planSummary
    }
  }

  return context
}

/**
 * Format context as a human-readable summary for clarification emails
 */
export function formatContextSummary(context: ClarificationContext): string {
  const parts: string[] = []

  if (context.fixDescription) {
    parts.push(`**What We Fixed**: ${context.fixDescription}`)
  }

  if (context.filesModified.length > 0) {
    const fileList = context.filesModified
      .slice(0, 5)
      .map((f) => `\`${f.path}\`${f.description ? ` (${f.description})` : ''}`)
      .join('\n- ')
    parts.push(`**Files Modified**:\n- ${fileList}`)
  }

  if (context.rootCauseIdentified) {
    parts.push(`**Root Cause Identified**: ${context.rootCauseIdentified}`)
  }

  if (context.testsAdded && context.testsAdded.length > 0) {
    parts.push(`**Tests Added**: ${context.testsAdded.join(', ')}`)
  }

  return parts.join('\n\n')
}
