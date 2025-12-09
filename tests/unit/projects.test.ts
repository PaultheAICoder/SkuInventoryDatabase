/**
 * Unit tests for project configuration
 */
import { describe, it, expect } from 'vitest'
import {
  PROJECTS,
  DEFAULT_PROJECT_ID,
  getProjectConfig,
  isValidProjectId,
  extractProjectFromBody,
} from '@/lib/projects'

describe('Project Configuration', () => {
  describe('PROJECTS registry', () => {
    it('contains SkuInventoryDatabase', () => {
      expect(PROJECTS.SkuInventoryDatabase).toBeDefined()
      expect(PROJECTS.SkuInventoryDatabase.owner).toBe('PaultheAICoder')
      expect(PROJECTS.SkuInventoryDatabase.repo).toBe('SkuInventoryDatabase')
    })

    it('contains NovusProjectDatabase', () => {
      expect(PROJECTS.NovusProjectDatabase).toBeDefined()
      expect(PROJECTS.NovusProjectDatabase.owner).toBe('PaultheAICoder')
      expect(PROJECTS.NovusProjectDatabase.repo).toBe('NovusProjectDatabase')
    })
  })

  describe('DEFAULT_PROJECT_ID', () => {
    it('is SkuInventoryDatabase', () => {
      expect(DEFAULT_PROJECT_ID).toBe('SkuInventoryDatabase')
    })
  })

  describe('getProjectConfig', () => {
    it('returns correct config for valid project ID', () => {
      const config = getProjectConfig('NovusProjectDatabase')
      expect(config.owner).toBe('PaultheAICoder')
      expect(config.repo).toBe('NovusProjectDatabase')
    })

    it('returns default config for null', () => {
      const config = getProjectConfig(null)
      expect(config.repo).toBe('SkuInventoryDatabase')
    })

    it('returns default config for undefined', () => {
      const config = getProjectConfig(undefined)
      expect(config.repo).toBe('SkuInventoryDatabase')
    })

    it('returns default config for invalid project ID', () => {
      const config = getProjectConfig('InvalidProject')
      expect(config.repo).toBe('SkuInventoryDatabase')
    })
  })

  describe('isValidProjectId', () => {
    it('returns true for valid project IDs', () => {
      expect(isValidProjectId('SkuInventoryDatabase')).toBe(true)
      expect(isValidProjectId('NovusProjectDatabase')).toBe(true)
    })

    it('returns false for invalid project IDs', () => {
      expect(isValidProjectId('InvalidProject')).toBe(false)
      expect(isValidProjectId('')).toBe(false)
    })
  })

  describe('extractProjectFromBody', () => {
    it('extracts project from issue body', () => {
      const body = `## Submitter Information
**Project**: NovusProjectDatabase
**Submitted by**: John (john@example.com)
`
      expect(extractProjectFromBody(body)).toBe('NovusProjectDatabase')
    })

    it('returns default for missing project field', () => {
      const body = `## Submitter Information
**Submitted by**: John (john@example.com)
`
      expect(extractProjectFromBody(body)).toBe('SkuInventoryDatabase')
    })

    it('returns default for null body', () => {
      expect(extractProjectFromBody(null)).toBe('SkuInventoryDatabase')
    })

    it('returns default for undefined body', () => {
      expect(extractProjectFromBody(undefined)).toBe('SkuInventoryDatabase')
    })

    it('returns default for invalid project in body', () => {
      const body = `**Project**: InvalidProject`
      expect(extractProjectFromBody(body)).toBe('SkuInventoryDatabase')
    })
  })
})
