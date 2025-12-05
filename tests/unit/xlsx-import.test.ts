import { describe, it, expect } from 'vitest'
import {
  generateSkuCode,
  extractDateFromFilename,
  normalizeSnapshotHeader,
} from '@/services/xlsx-import'

describe('xlsx-import service', () => {
  describe('generateSkuCode', () => {
    it('should convert item name to uppercase with dashes', () => {
      expect(generateSkuCode('3pk IFU')).toBe('3PK-IFU')
    })

    it('should truncate long words to 4 chars', () => {
      expect(generateSkuCode('Bubble Mailers')).toBe('BUBB-MAIL')
    })

    it('should remove special characters', () => {
      expect(generateSkuCode('Item (special)')).toBe('ITEM-SPEC')
    })

    it('should handle single word', () => {
      expect(generateSkuCode('Labels')).toBe('LABE')
    })

    it('should limit total length to 20 chars', () => {
      const longName = 'very long item name with many words here'
      const result = generateSkuCode(longName)
      expect(result.length).toBeLessThanOrEqual(20)
      expect(result).toBe('VERY-LONG-ITEM-NAME-')
    })

    it('should handle empty string', () => {
      expect(generateSkuCode('')).toBe('')
    })

    it('should handle whitespace-only string', () => {
      expect(generateSkuCode('   ')).toBe('')
    })

    it('should handle numbers', () => {
      expect(generateSkuCode('3pk boxes')).toBe('3PK-BOXE')
    })

    it('should handle item with slashes and hyphens', () => {
      // Hyphens and slashes are removed as special characters, leaving "ItemWithChars"
      // which is treated as a single word
      expect(generateSkuCode('Item-With/Chars')).toBe('ITEM')
    })

    it('should handle multiple spaces between words', () => {
      expect(generateSkuCode('Large   tools')).toBe('LARG-TOOL')
    })

    it('should handle Avery labels example', () => {
      expect(generateSkuCode('Avery labels')).toBe('AVER-LABE')
    })
  })

  describe('extractDateFromFilename', () => {
    it('should extract date from filename with YYYY-MM-DD prefix', () => {
      const result = extractDateFromFilename('2025-11-13_TonsilTech_Inventory.xlsx')
      expect(result).toBeInstanceOf(Date)
      expect(result?.toISOString().slice(0, 10)).toBe('2025-11-13')
    })

    it('should return null for filename without date', () => {
      expect(extractDateFromFilename('inventory.xlsx')).toBeNull()
    })

    it('should handle date in middle of filename', () => {
      const result = extractDateFromFilename('inventory_2025-11-20_final.xlsx')
      expect(result).toBeInstanceOf(Date)
      expect(result?.toISOString().slice(0, 10)).toBe('2025-11-20')
    })

    it('should extract first date if multiple dates present', () => {
      const result = extractDateFromFilename('2025-01-15_to_2025-01-20.xlsx')
      expect(result?.toISOString().slice(0, 10)).toBe('2025-01-15')
    })

    it('should handle filename with only numbers but not date format', () => {
      expect(extractDateFromFilename('inventory_12345.xlsx')).toBeNull()
    })

    it('should return null for invalid date', () => {
      // Invalid date (month 99)
      expect(extractDateFromFilename('2025-99-13_inventory.xlsx')).toBeNull()
    })
  })

  describe('normalizeSnapshotHeader', () => {
    it('should normalize Item to item', () => {
      expect(normalizeSnapshotHeader('Item')).toBe('item')
    })

    it('should normalize item name to item', () => {
      expect(normalizeSnapshotHeader('Item Name')).toBe('item')
    })

    it('should normalize Name to item', () => {
      expect(normalizeSnapshotHeader('Name')).toBe('item')
    })

    it('should normalize Product to item', () => {
      expect(normalizeSnapshotHeader('Product')).toBe('item')
    })

    it('should normalize Current Balance to current_balance', () => {
      expect(normalizeSnapshotHeader('Current Balance')).toBe('current_balance')
    })

    it('should normalize Balance to current_balance', () => {
      expect(normalizeSnapshotHeader('Balance')).toBe('current_balance')
    })

    it('should normalize Quantity to current_balance', () => {
      expect(normalizeSnapshotHeader('Quantity')).toBe('current_balance')
    })

    it('should normalize Qty to current_balance', () => {
      expect(normalizeSnapshotHeader('Qty')).toBe('current_balance')
    })

    it('should normalize On Hand to current_balance', () => {
      expect(normalizeSnapshotHeader('On Hand')).toBe('current_balance')
    })

    it('should return normalized version for unknown headers', () => {
      expect(normalizeSnapshotHeader('Some Other Column')).toBe('some_other_column')
    })

    it('should handle special characters', () => {
      expect(normalizeSnapshotHeader('Item (Primary)')).toBe('item_primary')
    })

    // New tests for Company/Brand/Location header normalization
    it('should normalize Company to company', () => {
      expect(normalizeSnapshotHeader('Company')).toBe('company')
    })

    it('should normalize Company Name to company', () => {
      expect(normalizeSnapshotHeader('Company Name')).toBe('company')
    })

    it('should normalize Brand to brand', () => {
      expect(normalizeSnapshotHeader('Brand')).toBe('brand')
    })

    it('should normalize Brand Name to brand', () => {
      expect(normalizeSnapshotHeader('Brand Name')).toBe('brand')
    })

    it('should normalize Location to location', () => {
      expect(normalizeSnapshotHeader('Location')).toBe('location')
    })

    it('should normalize Location Name to location', () => {
      expect(normalizeSnapshotHeader('Location Name')).toBe('location')
    })

    it('should normalize Warehouse to location', () => {
      expect(normalizeSnapshotHeader('Warehouse')).toBe('location')
    })

    it('should normalize Storage Location to location', () => {
      expect(normalizeSnapshotHeader('Storage Location')).toBe('location')
    })
  })
})
