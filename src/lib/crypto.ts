/**
 * Cryptographic utilities for secure token encryption/decryption
 * Uses AES-256-GCM for authenticated encryption
 *
 * [V2-DEFERRED] Currently unused in V1 - preserved for Shopify integration in V2
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto'

// Encryption constants
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // GCM standard IV length
const AUTH_TAG_LENGTH = 16 // GCM auth tag length
const KEY_LENGTH = 32 // 256 bits for AES-256
const SALT = 'shopify-token-salt' // Static salt for key derivation

/**
 * Derive a 256-bit encryption key from a secret string
 * Uses scrypt for secure key derivation
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.SHOPIFY_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET

  if (!secret) {
    throw new Error(
      'No encryption key available. Set SHOPIFY_ENCRYPTION_KEY or NEXTAUTH_SECRET environment variable.'
    )
  }

  // Derive a 256-bit key from the secret using scrypt
  return scryptSync(secret, SALT, KEY_LENGTH)
}

/**
 * Encrypt a plaintext string using AES-256-GCM
 * Returns a base64-encoded string containing: IV + ciphertext + auth tag
 *
 * @param plaintext - The string to encrypt
 * @returns Base64-encoded encrypted data (IV + ciphertext + authTag)
 * @throws Error if encryption fails or no encryption key is available
 */
export function encryptToken(plaintext: string): string {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty string')
  }

  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])

  const authTag = cipher.getAuthTag()

  // Combine IV + ciphertext + authTag into single buffer
  const combined = Buffer.concat([iv, encrypted, authTag])

  return combined.toString('base64')
}

/**
 * Decrypt a base64-encoded encrypted string using AES-256-GCM
 * Expects format: IV (12 bytes) + ciphertext + auth tag (16 bytes)
 *
 * @param ciphertext - Base64-encoded encrypted data
 * @returns Decrypted plaintext string
 * @throws Error if decryption fails, data is malformed, or no encryption key available
 */
export function decryptToken(ciphertext: string): string {
  if (!ciphertext) {
    throw new Error('Cannot decrypt empty string')
  }

  let combined: Buffer
  try {
    combined = Buffer.from(ciphertext, 'base64')
  } catch {
    throw new Error('Invalid base64 encoding')
  }

  // Minimum length: IV + at least 1 byte ciphertext + auth tag
  const minLength = IV_LENGTH + 1 + AUTH_TAG_LENGTH
  if (combined.length < minLength) {
    throw new Error('Ciphertext too short to be valid')
  }

  const key = getEncryptionKey()

  // Extract components
  const iv = combined.subarray(0, IV_LENGTH)
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH)
  const encrypted = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  try {
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ])

    return decrypted.toString('utf8')
  } catch (error) {
    // GCM will throw if auth tag doesn't match (tampering detected)
    if (error instanceof Error && error.message.includes('Unsupported state')) {
      throw new Error('Decryption failed: authentication tag mismatch')
    }
    throw new Error('Decryption failed: invalid or corrupted data')
  }
}

/**
 * Check if encryption keys are available
 * Useful for graceful degradation when encryption is optional
 */
export function isEncryptionAvailable(): boolean {
  return Boolean(
    process.env.SHOPIFY_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET
  )
}
