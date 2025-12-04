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

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          companyId: user.companyId,
          companyName: user.company.name,
          companies,
          selectedCompanyId,
          selectedCompanyName,
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
        token.selectedCompanyId = user.selectedCompanyId
        token.selectedCompanyName = user.selectedCompanyName
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

      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.companyId = token.companyId as string
        session.user.companyName = token.companyName as string
        session.user.companies = token.companies as Array<{ id: string; name: string; role?: string }>
        session.user.selectedCompanyId = token.selectedCompanyId as string
        session.user.selectedCompanyName = token.selectedCompanyName as string
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
    selectedCompanyId: string
    selectedCompanyName: string
  }

  interface Session {
    user: User & {
      id: string
      role: string
      companyId: string
      companyName: string
      companies: Array<{ id: string; name: string; role?: string }>
      selectedCompanyId: string
      selectedCompanyName: string
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: string
    companyId: string
    companyName: string
    companies: Array<{ id: string; name: string; role?: string }>
    selectedCompanyId: string
    selectedCompanyName: string
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
} as const
