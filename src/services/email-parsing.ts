/**
 * Email Reply Parsing Service
 *
 * Parses feedback reply emails to determine user intent:
 * - "verified" - User confirms the fix works
 * - "changes_requested" - User needs additional changes
 *
 * This service cleans email bodies by removing quoted text,
 * signatures, and other noise before keyword analysis.
 */

/**
 * Keywords indicating verification (fix works)
 */
const VERIFY_KEYWORDS = [
  'verified',
  'looks good',
  'works',
  'fixed',
  'confirmed',
  'approved',
  'great',
  'perfect',
  'thank you',
  'thanks',
  'all good',
  'working now',
  'issue resolved',
  'problem solved',
]

/**
 * Keywords indicating changes needed (fix incomplete)
 */
const CHANGE_KEYWORDS = [
  'changes needed',
  'not working',
  'still broken',
  'issue remains',
  'problem persists',
  'needs more work',
  "doesn't work",
  "does not work",
  'still not',
  'still having',
  'not fixed',
  'still see',
  'same issue',
  'same problem',
  'different issue',
  'another issue',
]

/**
 * Result of parsing an email reply
 */
export interface ParseResult {
  action: 'verified' | 'changes_requested' | null
  keyword: string | null
  cleanedBody: string
  confidence: 'high' | 'medium' | 'low'
}

/**
 * Clean email body by removing quoted text, signatures, and HTML
 */
function cleanEmailBody(body: string): string {
  // Remove HTML tags if present
  let cleaned = body.replace(/<[^>]*>/g, '')

  // Decode HTML entities
  cleaned = cleaned
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

  const lines = cleaned.split('\n')
  const cleanedLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    // Skip empty lines
    if (!trimmed) continue

    // Stop at signature delimiters
    if (['--', '---', '____', '====', '___'].includes(trimmed)) break

    // Skip quoted lines (email replies)
    if (trimmed.startsWith('>')) continue

    // Skip email client headers (stop processing at these)
    if (/^(On .+ wrote:|From:|Sent:|To:|Subject:|Date:)/i.test(trimmed)) break

    // Skip "Sent from" signatures
    if (/^Sent from /i.test(trimmed)) break

    // Skip "Get Outlook" and similar app signatures
    if (/^Get (Outlook|Gmail|Yahoo)/i.test(trimmed)) break

    // Skip confidentiality notices (common in corporate emails)
    if (/^(This email|This message|CONFIDENTIAL|NOTICE:|DISCLAIMER)/i.test(trimmed)) break

    cleanedLines.push(trimmed)

    // Stop after collecting enough content (first substantial paragraph)
    if (cleanedLines.length >= 10) break
  }

  return cleanedLines.join(' ')
}

/**
 * Find keyword in text with word boundary matching
 */
function findKeyword(text: string, keywords: string[]): string | null {
  const textLower = text.toLowerCase()

  for (const keyword of keywords) {
    // Escape special regex characters and create word boundary pattern
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`\\b${escapedKeyword}\\b`, 'i')

    if (pattern.test(textLower)) {
      return keyword
    }
  }

  return null
}

/**
 * Parse email body for verification or change request
 *
 * @param emailBody - Raw email body (may contain HTML)
 * @returns ParseResult with detected action and cleaned body
 */
export function parseReplyDecision(emailBody: string): ParseResult {
  const cleanedBody = cleanEmailBody(emailBody)

  // Handle empty body
  if (!cleanedBody.trim()) {
    return {
      action: null,
      keyword: null,
      cleanedBody,
      confidence: 'low',
    }
  }

  const verifyKeyword = findKeyword(cleanedBody, VERIFY_KEYWORDS)
  const changeKeyword = findKeyword(cleanedBody, CHANGE_KEYWORDS)

  // Handle ambiguous case (both types of keywords found)
  if (verifyKeyword && changeKeyword) {
    console.warn('[Email Parsing] Ambiguous email - contains both verify and change keywords')
    // Give priority to change keywords (safer to re-open than miss an issue)
    return {
      action: 'changes_requested',
      keyword: changeKeyword,
      cleanedBody,
      confidence: 'low',
    }
  }

  if (verifyKeyword) {
    return {
      action: 'verified',
      keyword: verifyKeyword,
      cleanedBody,
      confidence: 'high',
    }
  }

  if (changeKeyword) {
    return {
      action: 'changes_requested',
      keyword: changeKeyword,
      cleanedBody,
      confidence: 'high',
    }
  }

  // No clear keywords found
  return {
    action: null,
    keyword: null,
    cleanedBody,
    confidence: 'low',
  }
}

/**
 * Extract issue number from email subject
 *
 * Looks for patterns like:
 * - "Re: [Resolved] Your Bug Report #123"
 * - "RE: Your Feature Request #456"
 * - "#789"
 *
 * @param subject - Email subject line
 * @returns Issue number or null
 */
export function extractIssueNumber(subject: string): number | null {
  const match = subject.match(/#(\d+)/)
  if (match) {
    return parseInt(match[1], 10)
  }
  return null
}

/**
 * Check if an email appears to be a reply
 *
 * @param subject - Email subject line
 * @returns true if subject indicates a reply
 */
export function isReplyEmail(subject: string): boolean {
  const subjectLower = subject.toLowerCase().trim()
  return subjectLower.startsWith('re:') || subjectLower.startsWith('re: ')
}

// ============================================
// Clarification Response Parsing
// ============================================

/**
 * Result of parsing a clarification response
 */
export interface ClarificationResponseResult {
  fullResponse: string
  hasSubstantiveContent: boolean
}

/**
 * Parse a clarification response email body
 *
 * This extracts the user's response to clarification questions,
 * cleaning out signatures, quoted text, and email headers.
 *
 * @param emailBody - Raw email body (may contain HTML)
 * @returns Cleaned response and whether it has substantive content
 */
export function parseClarificationResponse(emailBody: string): ClarificationResponseResult {
  const cleanedBody = cleanEmailBody(emailBody)

  // Check if response has substantive content
  // (more than just "ok" or single word responses)
  const hasSubstantiveContent = cleanedBody.length > 20 && cleanedBody.split(' ').length > 3

  return {
    fullResponse: cleanedBody,
    hasSubstantiveContent,
  }
}
