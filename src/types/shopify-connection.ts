/**
 * [V2-DEFERRED] Shopify Connection Types
 * Moved from src/types/shopify-connection.ts on 2025-12-06
 * Reason: PRD V1 explicitly excludes integrations
 * Restore: Move back to src/types/ when V2 work begins
 */

import { z } from 'zod'

// Connection input schema for POST
export const createConnectionSchema = z.object({
  shopName: z.string()
    .min(1, 'Shop name is required')
    .max(100)
    .regex(/^[a-zA-Z0-9-]+$/, 'Shop name must be alphanumeric with hyphens only'),
  accessToken: z.string()
    .min(1, 'Access token is required')
    .max(255),
})

export type CreateConnectionInput = z.infer<typeof createConnectionSchema>

// Test connection input schema (optional fields for testing with stored credentials)
export const testConnectionSchema = z.object({
  shopName: z.string().min(1).max(100).optional(),
  accessToken: z.string().min(1).max(255).optional(),
})

export type TestConnectionInput = z.infer<typeof testConnectionSchema>

// Connection response (without exposing full token)
export interface ConnectionResponse {
  id: string
  shopName: string
  isActive: boolean
  lastSyncAt: string | null
  syncStatus: string | null
  hasToken: boolean
  createdAt: string
  updatedAt: string
}

// Test connection response
export interface TestConnectionResponse {
  success: boolean
  error?: string
  shopInfo?: {
    name: string
    email: string
    domain: string
    currency: string
    plan: string
  }
}

// API response wrappers
export interface GetConnectionApiResponse {
  data: ConnectionResponse | null
}

export interface CreateConnectionApiResponse {
  data: ConnectionResponse
  message: string
}

export interface TestConnectionApiResponse {
  data: TestConnectionResponse
}
