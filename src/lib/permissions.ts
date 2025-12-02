import type { UserRole } from '@prisma/client'

/**
 * Permission definitions for the application
 * Each permission maps to specific actions that can be performed
 */
export const PERMISSIONS = {
  // Component permissions
  'components:read': ['admin', 'ops', 'viewer'] as UserRole[],
  'components:create': ['admin', 'ops'] as UserRole[],
  'components:update': ['admin', 'ops'] as UserRole[],
  'components:delete': ['admin'] as UserRole[],

  // SKU permissions
  'skus:read': ['admin', 'ops', 'viewer'] as UserRole[],
  'skus:create': ['admin', 'ops'] as UserRole[],
  'skus:update': ['admin', 'ops'] as UserRole[],
  'skus:delete': ['admin'] as UserRole[],

  // BOM permissions
  'bom:read': ['admin', 'ops', 'viewer'] as UserRole[],
  'bom:create': ['admin', 'ops'] as UserRole[],
  'bom:update': ['admin', 'ops'] as UserRole[],
  'bom:activate': ['admin', 'ops'] as UserRole[],
  'bom:delete': ['admin'] as UserRole[],

  // Transaction permissions
  'transactions:read': ['admin', 'ops', 'viewer'] as UserRole[],
  'transactions:create': ['admin', 'ops'] as UserRole[],

  // User management permissions (admin only)
  'users:read': ['admin'] as UserRole[],
  'users:create': ['admin'] as UserRole[],
  'users:update': ['admin'] as UserRole[],
  'users:delete': ['admin'] as UserRole[],

  // Settings permissions (admin only)
  'settings:read': ['admin'] as UserRole[],
  'settings:update': ['admin'] as UserRole[],

  // Import/Export permissions
  'import:execute': ['admin', 'ops'] as UserRole[],
  'export:execute': ['admin', 'ops', 'viewer'] as UserRole[],
} as const

export type Permission = keyof typeof PERMISSIONS

/**
 * Check if a user role has a specific permission
 */
export function hasPermission(role: UserRole | undefined | null, permission: Permission): boolean {
  if (!role) return false
  const allowedRoles = PERMISSIONS[permission]
  return allowedRoles.includes(role)
}

/**
 * Check if a user role has any of the specified permissions
 */
export function hasAnyPermission(
  role: UserRole | undefined | null,
  permissions: Permission[]
): boolean {
  return permissions.some((permission) => hasPermission(role, permission))
}

/**
 * Check if a user role has all of the specified permissions
 */
export function hasAllPermissions(
  role: UserRole | undefined | null,
  permissions: Permission[]
): boolean {
  return permissions.every((permission) => hasPermission(role, permission))
}

/**
 * Get all permissions for a role
 */
export function getPermissionsForRole(role: UserRole): Permission[] {
  return Object.entries(PERMISSIONS)
    .filter(([, roles]) => roles.includes(role))
    .map(([permission]) => permission as Permission)
}

/**
 * Role hierarchy (higher index = more privileges)
 */
export const ROLE_HIERARCHY: UserRole[] = ['viewer', 'ops', 'admin']

/**
 * Check if one role is higher or equal to another
 */
export function isRoleAtLeast(role: UserRole | undefined | null, minimumRole: UserRole): boolean {
  if (!role) return false
  const roleIndex = ROLE_HIERARCHY.indexOf(role)
  const minimumIndex = ROLE_HIERARCHY.indexOf(minimumRole)
  return roleIndex >= minimumIndex
}

/**
 * Role display names
 */
export const ROLE_DISPLAY_NAMES: Record<UserRole, string> = {
  admin: 'Administrator',
  ops: 'Operations',
  viewer: 'Viewer',
}

/**
 * Role descriptions
 */
export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: 'Full access to all features including user management and settings',
  ops: 'Can manage components, SKUs, BOMs, and transactions',
  viewer: 'Read-only access to inventory data',
}
