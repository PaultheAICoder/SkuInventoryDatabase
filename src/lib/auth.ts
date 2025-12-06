import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { prisma } from './db'

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Please enter email and password')
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: {
            company: true,
            userCompanies: {
              include: {
                company: {
                  select: { id: true, name: true }
                }
              }
            }
          },
        })

        // Fetch brands for the user's primary company
        const brands = user ? await prisma.brand.findMany({
          where: {
            companyId: user.companyId,
            isActive: true,
          },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }) : []

        // Fetch brands for ALL user's accessible companies (for unified selector)
        const accessibleCompanyIds = user ? user.userCompanies.map(uc => uc.company.id) : []
        // Ensure primary company is included
        if (user && !accessibleCompanyIds.includes(user.companyId)) {
          accessibleCompanyIds.push(user.companyId)
        }
        const allBrands = user ? await prisma.brand.findMany({
          where: {
            companyId: { in: accessibleCompanyIds },
            isActive: true,
          },
          select: { id: true, name: true, companyId: true },
          orderBy: { name: 'asc' },
        }) : []

        if (!user || !user.isActive) {
          throw new Error('Invalid email or password')
        }

        const isPasswordValid = await compare(credentials.password, user.passwordHash)

        if (!isPasswordValid) {
          // Log failed login attempt
          await prisma.securityEvent.create({
            data: {
              companyId: user.companyId,
              userId: user.id,
              eventType: 'login_failed',
              details: { reason: 'invalid_password' },
            },
          })
          throw new Error('Invalid email or password')
        }

        // Update last login and log successful login
        await prisma.$transaction([
          prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          }),
          prisma.securityEvent.create({
            data: {
              companyId: user.companyId,
              userId: user.id,
              eventType: 'login',
            },
          }),
        ])

        // Build companies list from userCompanies
        const companiesFromJoin = user.userCompanies.map(uc => ({
          id: uc.company.id,
          name: uc.company.name,
          role: uc.role,
        }))

        // Ensure primary company is included (for backward compatibility)
        const primaryCompanyIncluded = companiesFromJoin.some(c => c.id === user.companyId)
        const companies = primaryCompanyIncluded
          ? companiesFromJoin
          : [{ id: user.company.id, name: user.company.name, role: user.role }, ...companiesFromJoin]

        // Selected company defaults to primary company
        const selectedCompanyId = user.companyId
        const selectedCompanyName = user.company.name

        // Build companiesWithBrands structure for unified selector
        const companiesWithBrands = companies.map(company => ({
          id: company.id,
          name: company.name,
          role: company.role,
          brands: allBrands
            .filter(b => b.companyId === company.id)
            .map(b => ({ id: b.id, name: b.name }))
        }))

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          companyId: user.companyId,
          companyName: user.company.name,
          companies,
          companiesWithBrands,
          selectedCompanyId,
          selectedCompanyName,
          brands: brands.map(b => ({ id: b.id, name: b.name })),
          selectedBrandId: brands[0]?.id ?? null,
          selectedBrandName: brands[0]?.name ?? null,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.companyId = user.companyId
        token.companyName = user.companyName
        token.companies = user.companies
        token.companiesWithBrands = user.companiesWithBrands
        token.selectedCompanyId = user.selectedCompanyId
        token.selectedCompanyName = user.selectedCompanyName
        token.brands = user.brands
        token.selectedBrandId = user.selectedBrandId
        token.selectedBrandName = user.selectedBrandName
      }

      // Validate user still exists and is active in database
      // This runs on every session access to catch deleted/deactivated users
      // Skip validation on initial login (user object present - user was just validated)
      if (token.id && !user) {
        const validUser = await validateUserExists(token.id as string)
        if (!validUser || !validUser.isActive) {
          // User deleted or deactivated - invalidate token
          // Fire-and-forget security logging (don't await to avoid performance impact)
          logSecurityEvent({
            companyId: token.companyId as string,
            userId: token.id as string,
            eventType: SECURITY_EVENTS.TOKEN_INVALIDATED,
            details: {
              reason: validUser ? 'user_deactivated' : 'user_not_found',
              email: token.email as string,
            },
          }).catch(() => {}) // Ignore logging failures

          // Return minimal token that will fail session checks
          return {
            ...token,
            id: undefined,
            role: undefined,
            companyId: undefined,
            error: (validUser ? 'user_deactivated' : 'user_not_found') as 'user_deactivated' | 'user_not_found',
          }
        }
      }

      // Ensure selectedCompanyId has a fallback value for backward compatibility
      // This handles tokens created before multi-company support was added
      if (!token.selectedCompanyId && token.companyId) {
        token.selectedCompanyId = token.companyId
        token.selectedCompanyName = token.companyName
      }

      // Handle session update (for company switching)
      if (trigger === 'update' && session?.selectedCompanyId) {
        // Verify user has access to the requested company
        const hasAccess = (token.companies as Array<{ id: string }>)?.some(
          c => c.id === session.selectedCompanyId
        )
        if (hasAccess) {
          token.selectedCompanyId = session.selectedCompanyId
          token.selectedCompanyName = session.selectedCompanyName
          // Keep companyId in sync for backward compatibility
          token.companyId = session.selectedCompanyId
          token.companyName = session.selectedCompanyName
        }
      }

      // Handle brand refresh when company changes (includes new brand list)
      if (trigger === 'update' && session?.brands !== undefined) {
        token.brands = session.brands
        token.selectedBrandId = session.selectedBrandId
        token.selectedBrandName = session.selectedBrandName
      }

      // Handle brand switch (within same company)
      if (trigger === 'update' && session?.selectedBrandId !== undefined && session?.brands === undefined) {
        // Verify brand belongs to selected company
        const hasAccess = session.selectedBrandId === null || (token.brands as Array<{ id: string }>)?.some(
          b => b.id === session.selectedBrandId
        )
        if (hasAccess) {
          token.selectedBrandId = session.selectedBrandId
          token.selectedBrandName = session.selectedBrandName
        }
      }

      return token
    },
    async session({ session, token }) {
      // Check if token was invalidated due to user deletion/deactivation
      if (!token.id || token.error) {
        // Return expired session to trigger re-authentication
        return { ...session, user: undefined as unknown as typeof session.user, expires: new Date(0).toISOString() }
      }

      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.companyId = token.companyId as string
        session.user.companyName = token.companyName as string
        session.user.companies = token.companies as Array<{ id: string; name: string; role?: string }>
        session.user.companiesWithBrands = token.companiesWithBrands as Array<{ id: string; name: string; role?: string; brands: Array<{ id: string; name: string }> }>
        session.user.selectedCompanyId = token.selectedCompanyId as string
        session.user.selectedCompanyName = token.selectedCompanyName as string
        session.user.brands = token.brands as Array<{ id: string; name: string }>
        session.user.selectedBrandId = token.selectedBrandId as string | null
        session.user.selectedBrandName = token.selectedBrandName as string | null
      }
      return session
    },
  },
}

// Extend NextAuth types
declare module 'next-auth' {
  interface User {
    id: string
    role: string
    companyId: string
    companyName: string
    companies: Array<{ id: string; name: string; role?: string }>
    companiesWithBrands: Array<{ id: string; name: string; role?: string; brands: Array<{ id: string; name: string }> }>
    selectedCompanyId: string
    selectedCompanyName: string
    brands: Array<{ id: string; name: string }>
    selectedBrandId: string | null
    selectedBrandName: string | null
  }

  interface Session {
    user: User & {
      id: string
      role: string
      companyId: string
      companyName: string
      companies: Array<{ id: string; name: string; role?: string }>
      companiesWithBrands: Array<{ id: string; name: string; role?: string; brands: Array<{ id: string; name: string }> }>
      selectedCompanyId: string
      selectedCompanyName: string
      brands: Array<{ id: string; name: string }>
      selectedBrandId: string | null
      selectedBrandName: string | null
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string // Optional to allow invalidation for deleted/deactivated users
    role?: string // Optional to allow invalidation for deleted/deactivated users
    companyId?: string // Optional to allow invalidation for deleted/deactivated users
    companyName: string
    companies: Array<{ id: string; name: string; role?: string }>
    companiesWithBrands: Array<{ id: string; name: string; role?: string; brands: Array<{ id: string; name: string }> }>
    selectedCompanyId: string
    selectedCompanyName: string
    brands: Array<{ id: string; name: string }>
    selectedBrandId: string | null
    selectedBrandName: string | null
    error?: 'user_deactivated' | 'user_not_found' // Set when token is invalidated
  }
}

/**
 * Log a security event
 */
export async function logSecurityEvent(params: {
  companyId: string
  userId?: string
  eventType: string
  ipAddress?: string
  userAgent?: string
  details?: Record<string, unknown>
}) {
  const { companyId, userId, eventType, ipAddress, userAgent, details } = params

  try {
    await prisma.securityEvent.create({
      data: {
        companyId,
        userId,
        eventType,
        ipAddress,
        userAgent,
        details: (details ?? {}) as object,
      },
    })
  } catch (error) {
    // Don't fail the main operation if logging fails
    console.error('Failed to log security event:', error)
  }
}

/**
 * Security event types
 */
export const SECURITY_EVENTS = {
  LOGIN: 'login',
  LOGIN_FAILED: 'login_failed',
  LOGOUT: 'logout',
  PASSWORD_CHANGED: 'password_changed',
  USER_CREATED: 'user_created',
  USER_UPDATED: 'user_updated',
  USER_DEACTIVATED: 'user_deactivated',
  ROLE_CHANGED: 'role_changed',
  SETTINGS_CHANGED: 'settings_changed',
  COMPANY_SWITCH: 'company_switch',
  TOKEN_INVALIDATED: 'token_invalidated',
} as const

/**
 * Validate that a user has access to a specific company
 * Checks both UserCompany assignments and primary company
 */
export function validateCompanyAccess(
  session: { user: { companies: Array<{ id: string }> } },
  companyId: string
): boolean {
  return session.user.companies.some((c) => c.id === companyId)
}

/**
 * Validate that a user ID exists in the database
 * Used to catch stale JWT tokens after database reseed
 * Returns the user record if found, null otherwise
 */
export async function validateUserExists(userId: string): Promise<{ id: string; email: string; isActive: boolean } | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, isActive: true }
    })
    return user
  } catch {
    return null
  }
}
