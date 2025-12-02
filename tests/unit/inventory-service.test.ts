import { describe, it, expect } from 'vitest'
import { calculateReorderStatus } from '@/services/inventory'
import { DEFAULT_SETTINGS, companySettingsSchema } from '@/types/settings'

/**
 * Tests for the inventory service functions.
 *
 * Focuses on calculateReorderStatus which was updated in Issue #6
 * to accept a configurable reorderWarningMultiplier parameter.
 */

describe('calculateReorderStatus', () => {
  describe('basic behavior', () => {
    it('returns "ok" when reorder point is 0 (no reorder tracking)', () => {
      expect(calculateReorderStatus(100, 0)).toBe('ok')
      expect(calculateReorderStatus(0, 0)).toBe('ok')
      expect(calculateReorderStatus(-10, 0)).toBe('ok')
    })

    it('returns "critical" when quantity is at or below reorder point', () => {
      expect(calculateReorderStatus(10, 10)).toBe('critical')
      expect(calculateReorderStatus(5, 10)).toBe('critical')
      expect(calculateReorderStatus(0, 10)).toBe('critical')
      expect(calculateReorderStatus(-5, 10)).toBe('critical')
    })

    it('returns "warning" when quantity is above reorder point but below warning threshold (default 1.5x)', () => {
      // With reorder point of 10 and default multiplier of 1.5, warning threshold is 15
      expect(calculateReorderStatus(11, 10)).toBe('warning')
      expect(calculateReorderStatus(14, 10)).toBe('warning')
      expect(calculateReorderStatus(15, 10)).toBe('warning') // exactly at threshold
    })

    it('returns "ok" when quantity is above warning threshold', () => {
      // With reorder point of 10 and default multiplier of 1.5, warning threshold is 15
      expect(calculateReorderStatus(16, 10)).toBe('ok')
      expect(calculateReorderStatus(100, 10)).toBe('ok')
    })
  })

  describe('custom reorderWarningMultiplier parameter', () => {
    it('uses default multiplier of 1.5 when not specified', () => {
      // Quantity 14 is below 10 * 1.5 = 15 (warning)
      expect(calculateReorderStatus(14, 10)).toBe('warning')
      // Quantity 16 is above 10 * 1.5 = 15 (ok)
      expect(calculateReorderStatus(16, 10)).toBe('ok')
    })

    it('applies custom multiplier of 2.0', () => {
      // With reorder point of 10 and multiplier of 2.0, warning threshold is 20
      // Quantity 19 would be "ok" with 1.5x but "warning" with 2.0x
      expect(calculateReorderStatus(19, 10, 2.0)).toBe('warning')
      expect(calculateReorderStatus(20, 10, 2.0)).toBe('warning') // exactly at threshold
      expect(calculateReorderStatus(21, 10, 2.0)).toBe('ok')
    })

    it('applies custom multiplier of 1.0 (no warning zone)', () => {
      // With multiplier of 1.0, warning threshold equals reorder point
      // Everything above reorder point is "ok"
      expect(calculateReorderStatus(10, 10, 1.0)).toBe('critical')
      expect(calculateReorderStatus(11, 10, 1.0)).toBe('ok')
    })

    it('applies custom multiplier of 3.0 (wide warning zone)', () => {
      // With reorder point of 10 and multiplier of 3.0, warning threshold is 30
      expect(calculateReorderStatus(25, 10, 3.0)).toBe('warning')
      expect(calculateReorderStatus(30, 10, 3.0)).toBe('warning')
      expect(calculateReorderStatus(31, 10, 3.0)).toBe('ok')
    })

    it('handles fractional multipliers', () => {
      // With reorder point of 100 and multiplier of 1.25, warning threshold is 125
      expect(calculateReorderStatus(124, 100, 1.25)).toBe('warning')
      expect(calculateReorderStatus(125, 100, 1.25)).toBe('warning')
      expect(calculateReorderStatus(126, 100, 1.25)).toBe('ok')
    })
  })

  describe('edge cases', () => {
    it('handles very small quantities', () => {
      expect(calculateReorderStatus(1, 10)).toBe('critical')
      expect(calculateReorderStatus(1, 1)).toBe('critical')
    })

    it('handles very large quantities', () => {
      expect(calculateReorderStatus(1000000, 100)).toBe('ok')
    })

    it('handles negative quantities (should be critical if reorder point > 0)', () => {
      expect(calculateReorderStatus(-100, 10)).toBe('critical')
    })

    it('handles very small multiplier (edge case)', () => {
      // With multiplier of 1.01, warning zone is very small
      expect(calculateReorderStatus(10, 10, 1.01)).toBe('critical')
      expect(calculateReorderStatus(11, 10, 1.01)).toBe('ok') // 10 * 1.01 = 10.1, so 11 > 10.1
    })
  })
})

describe('DEFAULT_SETTINGS and companySettingsSchema', () => {
  describe('DEFAULT_SETTINGS values', () => {
    it('has correct default for allowNegativeInventory', () => {
      expect(DEFAULT_SETTINGS.allowNegativeInventory).toBe(false)
    })

    it('has correct default for defaultLeadTimeDays', () => {
      expect(DEFAULT_SETTINGS.defaultLeadTimeDays).toBe(7)
    })

    it('has correct default for reorderWarningMultiplier', () => {
      expect(DEFAULT_SETTINGS.reorderWarningMultiplier).toBe(1.5)
    })

    it('has correct default for dateFormat', () => {
      expect(DEFAULT_SETTINGS.dateFormat).toBe('MM/DD/YYYY')
    })

    it('has correct default for currencySymbol', () => {
      expect(DEFAULT_SETTINGS.currencySymbol).toBe('$')
    })

    it('has correct default for decimalPlaces', () => {
      expect(DEFAULT_SETTINGS.decimalPlaces).toBe(2)
    })
  })

  describe('companySettingsSchema validation', () => {
    it('validates correct settings object', () => {
      const result = companySettingsSchema.safeParse({
        allowNegativeInventory: true,
        defaultLeadTimeDays: 14,
        reorderWarningMultiplier: 2.0,
        dateFormat: 'YYYY-MM-DD',
        currencySymbol: 'EUR',
        decimalPlaces: 4,
      })
      expect(result.success).toBe(true)
    })

    it('applies defaults for missing fields', () => {
      const result = companySettingsSchema.safeParse({})
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.allowNegativeInventory).toBe(false)
        expect(result.data.defaultLeadTimeDays).toBe(7)
        expect(result.data.reorderWarningMultiplier).toBe(1.5)
      }
    })

    it('rejects negative defaultLeadTimeDays', () => {
      const result = companySettingsSchema.safeParse({
        defaultLeadTimeDays: -5,
      })
      expect(result.success).toBe(false)
    })

    it('rejects non-positive reorderWarningMultiplier', () => {
      const result = companySettingsSchema.safeParse({
        reorderWarningMultiplier: 0,
      })
      expect(result.success).toBe(false)

      const result2 = companySettingsSchema.safeParse({
        reorderWarningMultiplier: -1,
      })
      expect(result2.success).toBe(false)
    })

    it('rejects invalid dateFormat', () => {
      const result = companySettingsSchema.safeParse({
        dateFormat: 'invalid-format',
      })
      expect(result.success).toBe(false)
    })

    it('rejects decimalPlaces outside valid range', () => {
      const result = companySettingsSchema.safeParse({
        decimalPlaces: -1,
      })
      expect(result.success).toBe(false)

      const result2 = companySettingsSchema.safeParse({
        decimalPlaces: 5,
      })
      expect(result2.success).toBe(false)
    })

    it('coerces string numbers correctly', () => {
      const result = companySettingsSchema.safeParse({
        defaultLeadTimeDays: '14',
        reorderWarningMultiplier: '2.5',
        decimalPlaces: '3',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.defaultLeadTimeDays).toBe(14)
        expect(result.data.reorderWarningMultiplier).toBe(2.5)
        expect(result.data.decimalPlaces).toBe(3)
      }
    })
  })

  describe('settings key validation (Issue #6 - seed script fix)', () => {
    it('validates the correct key is allowNegativeInventory not blockNegativeInventory', () => {
      // This validates that the schema uses the correct key name
      // The seed script was incorrectly using blockNegativeInventory
      const result = companySettingsSchema.safeParse({
        allowNegativeInventory: true, // Correct key
      })
      expect(result.success).toBe(true)

      // blockNegativeInventory is not a valid key - it should be stripped
      const result2 = companySettingsSchema.safeParse({
        blockNegativeInventory: false, // Wrong key - should be ignored/stripped
      })
      expect(result2.success).toBe(true)
      if (result2.success) {
        // blockNegativeInventory is not in schema, so it gets defaults
        expect(result2.data.allowNegativeInventory).toBe(false) // Default value
        expect((result2.data as Record<string, unknown>)['blockNegativeInventory']).toBeUndefined()
      }
    })
  })
})
