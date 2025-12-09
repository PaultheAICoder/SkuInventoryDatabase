/**
 * Project Configuration Registry
 *
 * Centralized configuration for multi-project feedback support.
 * All projects share the feedback email inbox (ai-coder@vital-enterprises.com).
 */

export interface ProjectConfig {
  owner: string
  repo: string
  displayName: string
}

export const PROJECTS: Record<string, ProjectConfig> = {
  SkuInventoryDatabase: {
    owner: 'PaultheAICoder',
    repo: 'SkuInventoryDatabase',
    displayName: 'SKU Inventory',
  },
  NovusProjectDatabase: {
    owner: 'PaultheAICoder',
    repo: 'NovusProjectDatabase',
    displayName: 'Novus Project Database',
  },
} as const

export type ProjectId = keyof typeof PROJECTS

// Default project for backwards compatibility
export const DEFAULT_PROJECT_ID: ProjectId = 'SkuInventoryDatabase'

/**
 * Get project configuration by ID
 * Returns default project if not found (backwards compatibility)
 */
export function getProjectConfig(projectId: string | null | undefined): ProjectConfig {
  if (projectId && projectId in PROJECTS) {
    return PROJECTS[projectId as ProjectId]
  }
  return PROJECTS[DEFAULT_PROJECT_ID]
}

/**
 * Validate if a project ID is valid
 */
export function isValidProjectId(projectId: string): projectId is ProjectId {
  return projectId in PROJECTS
}

/**
 * Extract project ID from GitHub issue body
 * Looks for pattern: **Project**: ProjectName
 */
export function extractProjectFromBody(body: string | null | undefined): ProjectId {
  if (!body) return DEFAULT_PROJECT_ID

  const match = body.match(/\*\*Project\*\*:\s*(\S+)/)
  if (match && isValidProjectId(match[1])) {
    return match[1] as ProjectId
  }

  return DEFAULT_PROJECT_ID
}
