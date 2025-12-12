/**
 * Credential Encryption Utilities (V2)
 *
 * Provides secure encryption/decryption for integration credentials using AES-256-GCM.
 * Uses a dedicated CREDENTIAL_ENCRYPTION_KEY separate from other encryption needs.
 *
 * Format: base64(iv:ciphertext:authTag)
 *
 * Security requirements (FR-021):
 * - AES-256-GCM authenticated encryption
 * - Unique IV per encryption operation
 * - Environment-based key management
 *
 * Audit requirements (FR-023):
 * - All credential access/modification logged
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto'

// Encryption constants
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // GCM standard IV length (96 bits)
const AUTH_TAG_LENGTH = 16 // GCM auth tag length (128 bits)
const _KEY_LENGTH = 32 // 256 bits for AES-256 - documented for key generation reference

// Audit event types for credential operations
export type CredentialAuditAction =
  | 'encrypt'
  | 'decrypt'
  | 'access'
  | 'store'
  | 'delete'
  | 'refresh'

export interface CredentialAuditEvent {
  action: CredentialAuditAction
  credentialId?: string
  integrationType?: string
  userId?: string
  timestamp: Date
  success: boolean
  error?: string
  metadata?: Record<string, unknown>
}

// Audit log storage (in-memory for now, can be extended to database)
const auditLog: CredentialAuditEvent[] = []

/**
 * Get the credential encryption key from environment
 * @throws Error if CREDENTIAL_ENCRYPTION_KEY is not set or invalid
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.CREDENTIAL_ENCRYPTION_KEY

  if (!keyHex) {
    throw new Error(
      'CREDENTIAL_ENCRYPTION_KEY environment variable is required for credential encryption'
    )
  }

  // Validate hex format and length (64 hex chars = 32 bytes)
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error(
      'CREDENTIAL_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Generate with: openssl rand -hex 32'
    )
  }

  return Buffer.from(keyHex, 'hex')
}

/**
 * Log a credential audit event
 * Called automatically by encrypt/decrypt operations
 */
export function logCredentialAudit(event: CredentialAuditEvent): void {
  auditLog.push(event)

  // In production, this would also write to database or external logging service
  if (process.env.NODE_ENV !== 'test') {
    console.log(
      `[CREDENTIAL_AUDIT] ${event.action.toUpperCase()} ` +
        `type=${event.integrationType || 'unknown'} ` +
        `credentialId=${event.credentialId || 'new'} ` +
        `userId=${event.userId || 'system'} ` +
        `success=${event.success}` +
        (event.error ? ` error="${event.error}"` : '')
    )
  }
}

/**
 * Get recent audit events (for debugging/admin)
 * @param limit Maximum number of events to return
 */
export function getRecentAuditEvents(limit = 100): CredentialAuditEvent[] {
  return auditLog.slice(-limit)
}

/**
 * Clear audit log (for testing only)
 */
export function clearAuditLog(): void {
  if (process.env.NODE_ENV !== 'test') {
    console.warn('clearAuditLog called in non-test environment')
  }
  auditLog.length = 0
}

export interface EncryptOptions {
  credentialId?: string
  integrationType?: string
  userId?: string
}

/**
 * Encrypt a credential string using AES-256-GCM
 *
 * @param plaintext - The credential to encrypt (access token, refresh token, etc.)
 * @param options - Optional metadata for audit logging
 * @returns Base64-encoded encrypted string (iv + ciphertext + authTag)
 * @throws Error if encryption fails or no encryption key available
 */
export function encrypt(plaintext: string, options: EncryptOptions = {}): string {
  const auditEvent: CredentialAuditEvent = {
    action: 'encrypt',
    credentialId: options.credentialId,
    integrationType: options.integrationType,
    userId: options.userId,
    timestamp: new Date(),
    success: false,
  }

  try {
    if (!plaintext) {
      throw new Error('Cannot encrypt empty credential')
    }

    const key = getEncryptionKey()
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv(ALGORITHM, key, iv)

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ])

    const authTag = cipher.getAuthTag()

    // Combine: IV (12 bytes) + ciphertext + authTag (16 bytes)
    const combined = Buffer.concat([iv, encrypted, authTag])
    const result = combined.toString('base64')

    auditEvent.success = true
    logCredentialAudit(auditEvent)

    return result
  } catch (error) {
    auditEvent.error = error instanceof Error ? error.message : 'Unknown error'
    logCredentialAudit(auditEvent)
    throw error
  }
}

/**
 * Decrypt a credential string encrypted with AES-256-GCM
 *
 * @param ciphertext - Base64-encoded encrypted credential
 * @param options - Optional metadata for audit logging
 * @returns Decrypted plaintext credential
 * @throws Error if decryption fails, data is tampered, or no key available
 */
export function decrypt(ciphertext: string, options: EncryptOptions = {}): string {
  const auditEvent: CredentialAuditEvent = {
    action: 'decrypt',
    credentialId: options.credentialId,
    integrationType: options.integrationType,
    userId: options.userId,
    timestamp: new Date(),
    success: false,
  }

  try {
    if (!ciphertext) {
      throw new Error('Cannot decrypt empty credential')
    }

    let combined: Buffer
    try {
      combined = Buffer.from(ciphertext, 'base64')
    } catch {
      throw new Error('Invalid base64 encoding in encrypted credential')
    }

    // Minimum length: IV (12) + at least 1 byte ciphertext + authTag (16) = 29 bytes
    const minLength = IV_LENGTH + 1 + AUTH_TAG_LENGTH
    if (combined.length < minLength) {
      throw new Error('Encrypted credential too short to be valid')
    }

    const key = getEncryptionKey()

    // Extract components
    const iv = combined.subarray(0, IV_LENGTH)
    const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH)
    const encrypted = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH)

    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ])

    auditEvent.success = true
    logCredentialAudit(auditEvent)

    return decrypted.toString('utf8')
  } catch (error) {
    // GCM throws if auth tag doesn't match (tampering detected)
    let errorMessage = 'Unknown error'
    if (error instanceof Error) {
      if (error.message.includes('Unsupported state') || error.message.includes('auth')) {
        errorMessage = 'Credential decryption failed: authentication tag mismatch (possible tampering)'
      } else {
        errorMessage = error.message
      }
    }

    auditEvent.error = errorMessage
    logCredentialAudit(auditEvent)
    throw new Error(errorMessage)
  }
}

/**
 * Check if credential encryption is properly configured
 */
export function isCredentialEncryptionAvailable(): boolean {
  try {
    getEncryptionKey()
    return true
  } catch {
    return false
  }
}

/**
 * Log a credential access event (for read operations without decryption)
 */
export function logCredentialAccess(options: {
  credentialId: string
  integrationType: string
  userId?: string
  action?: CredentialAuditAction
}): void {
  logCredentialAudit({
    action: options.action || 'access',
    credentialId: options.credentialId,
    integrationType: options.integrationType,
    userId: options.userId,
    timestamp: new Date(),
    success: true,
  })
}
