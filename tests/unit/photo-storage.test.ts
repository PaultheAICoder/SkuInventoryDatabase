import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { validateImageFile, generateS3Key, isS3Configured } from '@/services/photo-storage'

describe('photo-storage service', () => {
  describe('validateImageFile', () => {
    it('accepts valid JPEG file under size limit', () => {
      const file = {
        size: 5 * 1024 * 1024, // 5MB
        type: 'image/jpeg',
        name: 'test.jpg',
      }
      const result = validateImageFile(file)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('accepts valid PNG file', () => {
      const file = {
        size: 1024 * 1024, // 1MB
        type: 'image/png',
        name: 'test.png',
      }
      const result = validateImageFile(file)
      expect(result.valid).toBe(true)
    })

    it('accepts valid WebP file', () => {
      const file = {
        size: 1024 * 1024,
        type: 'image/webp',
        name: 'test.webp',
      }
      const result = validateImageFile(file)
      expect(result.valid).toBe(true)
    })

    it('accepts valid HEIC file', () => {
      const file = {
        size: 1024 * 1024,
        type: 'image/heic',
        name: 'test.heic',
      }
      const result = validateImageFile(file)
      expect(result.valid).toBe(true)
    })

    it('rejects file exceeding size limit', () => {
      const file = {
        size: 11 * 1024 * 1024, // 11MB (over 10MB limit)
        type: 'image/jpeg',
        name: 'large.jpg',
      }
      const result = validateImageFile(file)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('too large')
      expect(result.error).toContain('10MB')
    })

    it('rejects invalid file type', () => {
      const file = {
        size: 1024 * 1024,
        type: 'application/pdf',
        name: 'document.pdf',
      }
      const result = validateImageFile(file)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Invalid file type')
    })

    it('rejects GIF files (not in allowed types)', () => {
      const file = {
        size: 1024 * 1024,
        type: 'image/gif',
        name: 'animated.gif',
      }
      const result = validateImageFile(file)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Invalid file type')
    })

    it('accepts custom config with lower size limit', () => {
      const file = {
        size: 2 * 1024 * 1024, // 2MB
        type: 'image/jpeg',
        name: 'test.jpg',
      }
      const customConfig = {
        maxSizeBytes: 1 * 1024 * 1024, // 1MB
        allowedTypes: ['image/jpeg'],
        maxDimension: 2048,
        thumbnailSize: 300,
      }
      const result = validateImageFile(file, customConfig)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('too large')
    })
  })

  describe('generateS3Key', () => {
    it('generates correct main image key path', () => {
      const companyId = 'company-123'
      const transactionId = 'trans-456'
      const filename = 'photo.jpg'

      const key = generateS3Key(companyId, transactionId, filename, 'main')

      expect(key).toMatch(/^photos\/company-123\/trans-456\/\d+_photo\.webp$/)
    })

    it('generates correct thumbnail key path', () => {
      const companyId = 'company-123'
      const transactionId = 'trans-456'
      const filename = 'photo.jpg'

      const key = generateS3Key(companyId, transactionId, filename, 'thumbnail')

      expect(key).toMatch(/^photos\/company-123\/trans-456\/thumb_\d+_photo\.webp$/)
    })

    it('sanitizes filename with special characters', () => {
      const companyId = 'company-123'
      const transactionId = 'trans-456'
      const filename = 'my photo (1) [test].jpg'

      const key = generateS3Key(companyId, transactionId, filename, 'main')

      expect(key).not.toContain(' ')
      expect(key).not.toContain('(')
      expect(key).not.toContain(')')
      expect(key).not.toContain('[')
      expect(key).not.toContain(']')
      expect(key).toContain('my_photo__1___test_')
    })

    it('generates unique keys with timestamps', () => {
      const companyId = 'company-123'
      const transactionId = 'trans-456'
      const filename = 'photo.jpg'

      const key1 = generateS3Key(companyId, transactionId, filename, 'main')

      // Small delay to ensure different timestamp
      const startTime = Date.now()
      while (Date.now() === startTime) {
        // Wait for timestamp to change
      }

      const key2 = generateS3Key(companyId, transactionId, filename, 'main')

      expect(key1).not.toBe(key2)
    })

    it('defaults to main type when not specified', () => {
      const companyId = 'company-123'
      const transactionId = 'trans-456'
      const filename = 'photo.jpg'

      const key = generateS3Key(companyId, transactionId, filename)

      expect(key).not.toContain('thumb_')
    })
  })

  describe('isS3Configured', () => {
    const originalEnv = process.env

    beforeEach(() => {
      vi.resetModules()
      process.env = { ...originalEnv }
    })

    afterEach(() => {
      process.env = originalEnv
    })

    it('returns false when AWS credentials are missing', () => {
      delete process.env.AWS_ACCESS_KEY_ID
      delete process.env.AWS_SECRET_ACCESS_KEY
      delete process.env.PHOTO_S3_BUCKET

      const result = isS3Configured()
      expect(result).toBe(false)
    })

    it('returns false when bucket is missing', () => {
      process.env.AWS_ACCESS_KEY_ID = 'test-key'
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret'
      delete process.env.PHOTO_S3_BUCKET

      const result = isS3Configured()
      expect(result).toBe(false)
    })

    it('returns true when all credentials are set', () => {
      process.env.AWS_ACCESS_KEY_ID = 'test-key'
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret'
      process.env.PHOTO_S3_BUCKET = 'test-bucket'

      const result = isS3Configured()
      expect(result).toBe(true)
    })
  })
})
