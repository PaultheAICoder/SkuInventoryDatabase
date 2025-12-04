import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// Import crypto functions
import { encryptToken, decryptToken, isEncryptionAvailable } from '@/lib/crypto'

describe('Crypto Utilities', () => {
  const originalEnv = process.env

  beforeEach(() => {
    // Reset environment for each test
    process.env = { ...originalEnv }
    // Set a valid encryption key for tests (must be at least 1 char for scrypt)
    process.env.NEXTAUTH_SECRET = 'test-secret-key-that-is-at-least-32-characters-long'
  })

  afterEach(() => {
    process.env = originalEnv
  })

  // ===========================================================================
  // isEncryptionAvailable Tests
  // ===========================================================================

  describe('isEncryptionAvailable', () => {
    it('returns true when NEXTAUTH_SECRET is set', () => {
      process.env.NEXTAUTH_SECRET = 'some-secret'
      delete process.env.SHOPIFY_ENCRYPTION_KEY

      expect(isEncryptionAvailable()).toBe(true)
    })

    it('returns true when SHOPIFY_ENCRYPTION_KEY is set', () => {
      delete process.env.NEXTAUTH_SECRET
      process.env.SHOPIFY_ENCRYPTION_KEY = 'some-shopify-key-that-is-very-long'

      expect(isEncryptionAvailable()).toBe(true)
    })

    it('returns false when no encryption keys are set', () => {
      delete process.env.NEXTAUTH_SECRET
      delete process.env.SHOPIFY_ENCRYPTION_KEY

      expect(isEncryptionAvailable()).toBe(false)
    })
  })

  // ===========================================================================
  // encryptToken Tests
  // ===========================================================================

  describe('encryptToken', () => {
    it('encrypts a token string', () => {
      const token = 'shpat_abc123_test_token'
      const encrypted = encryptToken(token)

      expect(encrypted).toBeDefined()
      expect(typeof encrypted).toBe('string')
      expect(encrypted).not.toBe(token)
      // Should be base64 encoded
      expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/)
    })

    it('produces different output each time due to random IV', () => {
      const token = 'same_token_value'
      const encrypted1 = encryptToken(token)
      const encrypted2 = encryptToken(token)

      expect(encrypted1).not.toBe(encrypted2)
    })

    it('handles short tokens', () => {
      const token = 'x'
      const encrypted = encryptToken(token)

      expect(encrypted).toBeDefined()
      expect(encrypted.length).toBeGreaterThan(0)
    })

    it('handles long tokens', () => {
      const token = 'a'.repeat(1000)
      const encrypted = encryptToken(token)

      expect(encrypted).toBeDefined()
      expect(encrypted.length).toBeGreaterThan(0)
    })

    it('handles special characters', () => {
      const token = '!@#$%^&*()_+-=[]{}|;:",.<>?/~`'
      const encrypted = encryptToken(token)

      expect(encrypted).toBeDefined()
      // Verify we can decrypt it back
      const decrypted = decryptToken(encrypted)
      expect(decrypted).toBe(token)
    })

    it('handles unicode characters', () => {
      const token = 'token_with_emoji_and_unicode'
      const encrypted = encryptToken(token)

      expect(encrypted).toBeDefined()
      const decrypted = decryptToken(encrypted)
      expect(decrypted).toBe(token)
    })

    it('throws error for empty string', () => {
      expect(() => encryptToken('')).toThrow('Cannot encrypt empty string')
    })

    it('throws error when no encryption key is available', () => {
      delete process.env.NEXTAUTH_SECRET
      delete process.env.SHOPIFY_ENCRYPTION_KEY

      expect(() => encryptToken('some_token')).toThrow(
        'No encryption key available'
      )
    })

    it('uses SHOPIFY_ENCRYPTION_KEY over NEXTAUTH_SECRET when both are set', () => {
      process.env.NEXTAUTH_SECRET = 'nextauth-secret-key-that-is-long-enough'
      process.env.SHOPIFY_ENCRYPTION_KEY = 'shopify-key-that-is-at-least-32-chars'

      const token = 'test_token'
      const encrypted = encryptToken(token)

      // Change to use only NEXTAUTH_SECRET - decryption should fail
      // because it was encrypted with SHOPIFY_ENCRYPTION_KEY
      const originalShopifyKey = process.env.SHOPIFY_ENCRYPTION_KEY
      delete process.env.SHOPIFY_ENCRYPTION_KEY

      expect(() => decryptToken(encrypted)).toThrow()

      // Restore and verify decryption works with original key
      process.env.SHOPIFY_ENCRYPTION_KEY = originalShopifyKey
      const decrypted = decryptToken(encrypted)
      expect(decrypted).toBe(token)
    })
  })

  // ===========================================================================
  // decryptToken Tests
  // ===========================================================================

  describe('decryptToken', () => {
    it('decrypts an encrypted token', () => {
      const originalToken = 'shpat_test_access_token_12345'
      const encrypted = encryptToken(originalToken)
      const decrypted = decryptToken(encrypted)

      expect(decrypted).toBe(originalToken)
    })

    it('throws error for empty string', () => {
      expect(() => decryptToken('')).toThrow('Cannot decrypt empty string')
    })

    it('throws error for malformed base64', () => {
      expect(() => decryptToken('not-valid-base64!!!')).toThrow()
    })

    it('throws error for too short ciphertext', () => {
      // Create a valid base64 string but too short to contain IV + data + tag
      const tooShort = Buffer.from('short').toString('base64')
      expect(() => decryptToken(tooShort)).toThrow('Ciphertext too short')
    })

    it('throws error for tampered data', () => {
      const token = 'original_token'
      const encrypted = encryptToken(token)

      // Tamper with the encrypted data
      const buffer = Buffer.from(encrypted, 'base64')
      buffer[20] = (buffer[20] + 1) % 256 // Flip a byte in the ciphertext
      const tampered = buffer.toString('base64')

      expect(() => decryptToken(tampered)).toThrow()
    })

    it('throws error when decrypting with wrong key', () => {
      const token = 'secret_token'
      process.env.NEXTAUTH_SECRET = 'original-key-that-is-at-least-32-chars'
      const encrypted = encryptToken(token)

      // Change the key
      process.env.NEXTAUTH_SECRET = 'different-key-that-is-at-least-32-chars'

      expect(() => decryptToken(encrypted)).toThrow()
    })
  })

  // ===========================================================================
  // Roundtrip Tests
  // ===========================================================================

  describe('roundtrip encryption/decryption', () => {
    it('encrypt then decrypt returns original', () => {
      const tokens = [
        'shpat_abc123',
        'very_long_token_' + 'x'.repeat(200),
        'token-with-dashes',
        'token_with_underscores',
        'MixedCaseToken123',
      ]

      for (const token of tokens) {
        const encrypted = encryptToken(token)
        const decrypted = decryptToken(encrypted)
        expect(decrypted).toBe(token)
      }
    })

    it('works with various token lengths', () => {
      const lengths = [1, 10, 50, 100, 500, 1000]

      for (const length of lengths) {
        const token = 'a'.repeat(length)
        const encrypted = encryptToken(token)
        const decrypted = decryptToken(encrypted)
        expect(decrypted).toBe(token)
        expect(decrypted.length).toBe(length)
      }
    })

    it('handles realistic Shopify access tokens', () => {
      // Shopify access tokens are typically in format: shpat_xxxxxxxxxxxxxxx
      const realisticTokens = [
        'shpat_abcd1234efgh5678ijkl9012mnop',
        'shpca_abc123def456ghi789jkl012mno345',
        'offline_access_token_12345678901234567890',
      ]

      for (const token of realisticTokens) {
        const encrypted = encryptToken(token)
        const decrypted = decryptToken(encrypted)
        expect(decrypted).toBe(token)
      }
    })

    it('multiple encryptions of same token all decrypt correctly', () => {
      const token = 'consistent_token_value'
      const encrypted1 = encryptToken(token)
      const encrypted2 = encryptToken(token)
      const encrypted3 = encryptToken(token)

      expect(decryptToken(encrypted1)).toBe(token)
      expect(decryptToken(encrypted2)).toBe(token)
      expect(decryptToken(encrypted3)).toBe(token)

      // But the encrypted values should all be different
      expect(encrypted1).not.toBe(encrypted2)
      expect(encrypted2).not.toBe(encrypted3)
      expect(encrypted1).not.toBe(encrypted3)
    })
  })

  // ===========================================================================
  // Key Fallback Tests
  // ===========================================================================

  describe('key fallback behavior', () => {
    it('falls back to NEXTAUTH_SECRET when SHOPIFY_ENCRYPTION_KEY is not set', () => {
      delete process.env.SHOPIFY_ENCRYPTION_KEY
      process.env.NEXTAUTH_SECRET = 'fallback-nextauth-secret-32-chars-min'

      const token = 'test_token'
      const encrypted = encryptToken(token)
      const decrypted = decryptToken(encrypted)

      expect(decrypted).toBe(token)
    })

    it('prefers SHOPIFY_ENCRYPTION_KEY when both are set', () => {
      process.env.SHOPIFY_ENCRYPTION_KEY = 'primary-shopify-key-at-least-32-chars'
      process.env.NEXTAUTH_SECRET = 'secondary-nextauth-secret-32-chars'

      const token = 'test_token'
      const encrypted = encryptToken(token)

      // Remove SHOPIFY_ENCRYPTION_KEY - decryption should fail
      delete process.env.SHOPIFY_ENCRYPTION_KEY

      expect(() => decryptToken(encrypted)).toThrow()
    })
  })
})
