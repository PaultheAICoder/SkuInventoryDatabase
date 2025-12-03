import { describe, it, expect } from 'vitest'
import { createBOMVersionSchema } from '@/types/bom'
import { createBuildSchema } from '@/types/transaction'

/**
 * Tests for Issue #15 - Capture defect/quality notes per BOM version and build
 *
 * These tests verify that:
 * 1. BOM version schema accepts defectNotes and qualityMetadata fields
 * 2. Build transaction schema accepts defectCount, defectNotes, and affectedUnits fields
 * 3. All new fields are optional and nullable as required
 */

describe('BOM Version defect/quality fields', () => {
  const validBOMVersionBase = {
    versionName: 'v1.0',
    effectiveStartDate: new Date(),
    isActive: true,
    notes: null,
    lines: [
      {
        componentId: '123e4567-e89b-12d3-a456-426614174000',
        quantityPerUnit: 2,
        notes: null,
      },
    ],
  }

  describe('defectNotes field', () => {
    it('accepts defectNotes as a string', () => {
      const result = createBOMVersionSchema.safeParse({
        ...validBOMVersionBase,
        defectNotes: 'Known issue with component alignment',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.defectNotes).toBe('Known issue with component alignment')
      }
    })

    it('accepts defectNotes as null', () => {
      const result = createBOMVersionSchema.safeParse({
        ...validBOMVersionBase,
        defectNotes: null,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.defectNotes).toBeNull()
      }
    })

    it('accepts missing defectNotes (undefined)', () => {
      const result = createBOMVersionSchema.safeParse({
        ...validBOMVersionBase,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.defectNotes).toBeUndefined()
      }
    })

    it('accepts empty string for defectNotes', () => {
      const result = createBOMVersionSchema.safeParse({
        ...validBOMVersionBase,
        defectNotes: '',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.defectNotes).toBe('')
      }
    })
  })

  describe('qualityMetadata field', () => {
    it('accepts qualityMetadata as an empty object', () => {
      const result = createBOMVersionSchema.safeParse({
        ...validBOMVersionBase,
        qualityMetadata: {},
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.qualityMetadata).toEqual({})
      }
    })

    it('accepts qualityMetadata with various properties', () => {
      const metadata = {
        inspectionDate: '2024-01-15',
        inspector: 'John Doe',
        passRate: 0.95,
        issues: ['minor scratches', 'color variation'],
        approved: true,
      }
      const result = createBOMVersionSchema.safeParse({
        ...validBOMVersionBase,
        qualityMetadata: metadata,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.qualityMetadata).toEqual(metadata)
      }
    })

    it('defaults to empty object when qualityMetadata is not provided', () => {
      const result = createBOMVersionSchema.safeParse({
        ...validBOMVersionBase,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.qualityMetadata).toEqual({})
      }
    })

    it('accepts nested objects in qualityMetadata', () => {
      const metadata = {
        measurements: {
          length: 10.5,
          width: 5.2,
          tolerance: 0.01,
        },
        status: 'reviewed',
      }
      const result = createBOMVersionSchema.safeParse({
        ...validBOMVersionBase,
        qualityMetadata: metadata,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.qualityMetadata).toEqual(metadata)
      }
    })
  })

  describe('combined defect and quality fields', () => {
    it('accepts both defectNotes and qualityMetadata together', () => {
      const result = createBOMVersionSchema.safeParse({
        ...validBOMVersionBase,
        defectNotes: 'Minor cosmetic issues noted',
        qualityMetadata: {
          defectRate: 0.02,
          category: 'cosmetic',
        },
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.defectNotes).toBe('Minor cosmetic issues noted')
        expect(result.data.qualityMetadata).toEqual({
          defectRate: 0.02,
          category: 'cosmetic',
        })
      }
    })
  })
})

describe('Build Transaction defect fields', () => {
  const validBuildBase = {
    date: new Date(),
    skuId: '123e4567-e89b-12d3-a456-426614174000',
    unitsToBuild: 10,
    salesChannel: 'Amazon',
    notes: null,
  }

  describe('defectCount field', () => {
    it('accepts defectCount as a positive integer', () => {
      const result = createBuildSchema.safeParse({
        ...validBuildBase,
        defectCount: 5,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.defectCount).toBe(5)
      }
    })

    it('accepts defectCount as zero', () => {
      const result = createBuildSchema.safeParse({
        ...validBuildBase,
        defectCount: 0,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.defectCount).toBe(0)
      }
    })

    it('accepts defectCount as null', () => {
      const result = createBuildSchema.safeParse({
        ...validBuildBase,
        defectCount: null,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.defectCount).toBeNull()
      }
    })

    it('accepts missing defectCount (undefined)', () => {
      const result = createBuildSchema.safeParse({
        ...validBuildBase,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.defectCount).toBeUndefined()
      }
    })

    it('rejects negative defectCount', () => {
      const result = createBuildSchema.safeParse({
        ...validBuildBase,
        defectCount: -1,
      })
      expect(result.success).toBe(false)
    })

    it('coerces string number to integer for defectCount', () => {
      const result = createBuildSchema.safeParse({
        ...validBuildBase,
        defectCount: '3',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.defectCount).toBe(3)
      }
    })
  })

  describe('defectNotes field', () => {
    it('accepts defectNotes as a string', () => {
      const result = createBuildSchema.safeParse({
        ...validBuildBase,
        defectNotes: 'Units had cosmetic defects in finish',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.defectNotes).toBe('Units had cosmetic defects in finish')
      }
    })

    it('accepts defectNotes as null', () => {
      const result = createBuildSchema.safeParse({
        ...validBuildBase,
        defectNotes: null,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.defectNotes).toBeNull()
      }
    })

    it('accepts missing defectNotes (undefined)', () => {
      const result = createBuildSchema.safeParse({
        ...validBuildBase,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.defectNotes).toBeUndefined()
      }
    })
  })

  describe('affectedUnits field', () => {
    it('accepts affectedUnits as a positive integer', () => {
      const result = createBuildSchema.safeParse({
        ...validBuildBase,
        affectedUnits: 3,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.affectedUnits).toBe(3)
      }
    })

    it('accepts affectedUnits as zero', () => {
      const result = createBuildSchema.safeParse({
        ...validBuildBase,
        affectedUnits: 0,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.affectedUnits).toBe(0)
      }
    })

    it('accepts affectedUnits as null', () => {
      const result = createBuildSchema.safeParse({
        ...validBuildBase,
        affectedUnits: null,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.affectedUnits).toBeNull()
      }
    })

    it('accepts missing affectedUnits (undefined)', () => {
      const result = createBuildSchema.safeParse({
        ...validBuildBase,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.affectedUnits).toBeUndefined()
      }
    })

    it('rejects negative affectedUnits', () => {
      const result = createBuildSchema.safeParse({
        ...validBuildBase,
        affectedUnits: -1,
      })
      expect(result.success).toBe(false)
    })

    it('coerces string number to integer for affectedUnits', () => {
      const result = createBuildSchema.safeParse({
        ...validBuildBase,
        affectedUnits: '7',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.affectedUnits).toBe(7)
      }
    })
  })

  describe('combined defect fields', () => {
    it('accepts all defect fields together', () => {
      const result = createBuildSchema.safeParse({
        ...validBuildBase,
        defectCount: 2,
        defectNotes: 'Paint bubbling on 2 units',
        affectedUnits: 2,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.defectCount).toBe(2)
        expect(result.data.defectNotes).toBe('Paint bubbling on 2 units')
        expect(result.data.affectedUnits).toBe(2)
      }
    })

    it('accepts defectNotes without defectCount (partial defect info)', () => {
      const result = createBuildSchema.safeParse({
        ...validBuildBase,
        defectNotes: 'Minor quality issues observed',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.defectNotes).toBe('Minor quality issues observed')
        expect(result.data.defectCount).toBeUndefined()
      }
    })

    it('accepts defectCount without defectNotes', () => {
      const result = createBuildSchema.safeParse({
        ...validBuildBase,
        defectCount: 1,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.defectCount).toBe(1)
        expect(result.data.defectNotes).toBeUndefined()
      }
    })
  })

  describe('real-world build transaction scenarios', () => {
    it('handles a typical production run with no defects', () => {
      const result = createBuildSchema.safeParse({
        date: new Date('2024-01-15'),
        skuId: '123e4567-e89b-12d3-a456-426614174000',
        unitsToBuild: 100,
        salesChannel: 'Amazon',
        notes: 'Standard production run',
        defectCount: 0,
        defectNotes: null,
        affectedUnits: 0,
      })
      expect(result.success).toBe(true)
    })

    it('handles a production run with defects', () => {
      const result = createBuildSchema.safeParse({
        date: new Date('2024-01-15'),
        skuId: '123e4567-e89b-12d3-a456-426614174000',
        unitsToBuild: 100,
        salesChannel: 'Direct',
        notes: 'Production run with quality issues',
        defectCount: 5,
        defectNotes: '3 units with scratches, 2 units with misaligned parts',
        affectedUnits: 5,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.defectCount).toBe(5)
        expect(result.data.affectedUnits).toBe(5)
      }
    })

    it('handles form submission with string numbers from HTML inputs', () => {
      // HTML form inputs often submit numbers as strings
      const result = createBuildSchema.safeParse({
        date: '2024-01-15',
        skuId: '123e4567-e89b-12d3-a456-426614174000',
        unitsToBuild: '50',
        salesChannel: 'Shopify',
        notes: '',
        defectCount: '2',
        defectNotes: 'Minor issues',
        affectedUnits: '2',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.unitsToBuild).toBe(50)
        expect(result.data.defectCount).toBe(2)
        expect(result.data.affectedUnits).toBe(2)
      }
    })
  })
})
