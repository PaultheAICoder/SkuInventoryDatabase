/**
 * API Test Utilities
 * Provides helpers for making authenticated API requests in tests
 */
import { NextRequest } from 'next/server'

/**
 * Test session type matching NextAuth session structure
 */
export interface TestSession {
  user: {
    id: string
    email: string
    name: string
    role: 'admin' | 'ops' | 'viewer'
    companyId: string
    companyName: string
  }
}

/**
 * Helper to create a mock NextRequest with optional body and headers
 */
export function createMockRequest(
  url: string,
  options: {
    method?: string
    body?: Record<string, unknown>
    headers?: Record<string, string>
  } = {}
): NextRequest {
  const { method = 'GET', body, headers = {} } = options

  const requestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  }

  return new NextRequest(new URL(url, 'http://localhost:4500'), requestInit)
}

/**
 * Pre-defined test users matching seed.ts credentials.
 * IDs and companyId will be populated from DB when running integration tests.
 */
export const TEST_USERS = {
  admin: {
    id: '', // Will be populated from DB
    email: 'admin@tonsil.tech',
    password: 'changeme123',
    name: 'Admin User',
    role: 'admin' as const,
    companyId: '',
    companyName: 'Tonsil Tech',
  },
  ops: {
    id: '',
    email: 'ops@tonsil.tech',
    password: 'changeme123',
    name: 'Operations User',
    role: 'ops' as const,
    companyId: '',
    companyName: 'Tonsil Tech',
  },
  viewer: {
    id: '',
    email: 'viewer@tonsil.tech',
    password: 'changeme123',
    name: 'Viewer User',
    role: 'viewer' as const,
    companyId: '',
    companyName: 'Tonsil Tech',
  },
}

/**
 * Helper to assert API response status
 */
export function expectStatus(response: Response, status: number): void {
  if (response.status !== status) {
    throw new Error(`Expected status ${status}, got ${response.status}`)
  }
}

/**
 * Helper to parse JSON response
 */
export async function parseResponse<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>
}
