import { z } from 'zod'

// User create schema (admin only)
export const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required').max(100),
  role: z.enum(['admin', 'ops', 'viewer']).default('ops'),
})

export type CreateUserInput = z.infer<typeof createUserSchema>

// User update schema (admin only)
export const updateUserSchema = z.object({
  email: z.string().email('Invalid email address').optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  name: z.string().min(1, 'Name is required').max(100).optional(),
  role: z.enum(['admin', 'ops', 'viewer']).optional(),
  isActive: z.boolean().optional(),
})

export type UpdateUserInput = z.infer<typeof updateUserSchema>

// User list query schema
export const userListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
  search: z.string().optional(),
  role: z.enum(['admin', 'ops', 'viewer']).optional(),
  isActive: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
  sortBy: z.enum(['name', 'email', 'role', 'createdAt', 'lastLoginAt']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
})

export type UserListQuery = z.infer<typeof userListQuerySchema>

// User response type (what API returns)
export interface UserResponse {
  id: string
  email: string
  name: string
  role: 'admin' | 'ops' | 'viewer'
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

// User's company assignment (what API returns)
export interface UserCompanyAssignment {
  id: string
  companyId: string
  companyName: string
  role: 'admin' | 'ops' | 'viewer'
  isPrimary: boolean
  assignedAt: string
}

// Extended user response with company assignments
export interface UserWithCompaniesResponse extends UserResponse {
  companies: UserCompanyAssignment[]
}

// Update user company assignments schema
export const updateUserCompaniesSchema = z.object({
  companyIds: z.array(z.string().uuid()).min(1, 'At least one company is required'),
})

export type UpdateUserCompaniesInput = z.infer<typeof updateUserCompaniesSchema>

// Password change schema (self-service)
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
})

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
