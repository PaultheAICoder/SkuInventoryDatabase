import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { success, unauthorized, serverError, error, parseBody } from '@/lib/api-response'
import { Octokit } from '@octokit/rest'
import { z } from 'zod'
import { getProjectConfig, DEFAULT_PROJECT_ID } from '@/lib/projects'

// Get project config for this project
const project = getProjectConfig(DEFAULT_PROJECT_ID)

const updateIssueSchema = z.object({
  state: z.enum(['open', 'closed']),
})

/**
 * PATCH /api/github/issues/[issueNumber] - Update a GitHub issue (close/reopen)
 *
 * This endpoint is primarily used by E2E tests to clean up test-created issues.
 * Requires authentication.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ issueNumber: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return unauthorized()
    }

    const { issueNumber } = await params
    const issueNum = parseInt(issueNumber, 10)
    if (isNaN(issueNum) || issueNum <= 0) {
      return error('Invalid issue number', 400, 'BadRequest')
    }

    const { data, error: parseError } = await parseBody(request, updateIssueSchema)
    if (parseError) {
      return parseError
    }

    const githubToken = process.env.GITHUB_API_TOKEN
    if (!githubToken) {
      console.error('GITHUB_API_TOKEN environment variable not set')
      return error('GitHub integration not configured', 500, 'ServiceUnavailable')
    }

    const octokit = new Octokit({ auth: githubToken })

    const { data: issue } = await octokit.issues.update({
      owner: project.owner,
      repo: project.repo,
      issue_number: issueNum,
      state: data.state,
    })

    return success({
      issueNumber: issue.number,
      state: issue.state,
      url: issue.html_url,
    })
  } catch (err) {
    console.error('Error updating GitHub issue:', err)

    if (err instanceof Error) {
      if (err.message.includes('Bad credentials')) {
        return error('GitHub token invalid or expired', 500, 'ServiceUnavailable')
      }
      if (err.message.includes('Not Found')) {
        return error('GitHub issue not found', 404, 'NotFound')
      }
    }

    return serverError('Failed to update GitHub issue')
  }
}
