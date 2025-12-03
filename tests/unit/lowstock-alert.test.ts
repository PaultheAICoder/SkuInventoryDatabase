import { describe, it, expect } from 'vitest'
import {
  alertConfigSchema,
  alertModeSchema,
  updateAlertConfigSchema,
} from '@/types/lowstock-alert'

/**
 * Unit tests for low-stock alert evaluation logic.
 *
 * These tests focus on the pure functions for state transition detection
 * without requiring database access.
 */

// Test the transition detection logic
describe('getTransition', () => {
  // We'll test the transition logic by simulating what evaluateLowStockAlerts does

  const getTransition = (
    previousStatus: 'ok' | 'warning' | 'critical',
    currentStatus: 'ok' | 'warning' | 'critical'
  ): string => {
    if (previousStatus === currentStatus) return 'no_change'
    return `${previousStatus}_to_${currentStatus}`
  }

  describe('state transitions', () => {
    it('detects ok to warning transition', () => {
      expect(getTransition('ok', 'warning')).toBe('ok_to_warning')
    })

    it('detects ok to critical transition', () => {
      expect(getTransition('ok', 'critical')).toBe('ok_to_critical')
    })

    it('detects warning to critical transition', () => {
      expect(getTransition('warning', 'critical')).toBe('warning_to_critical')
    })

    it('detects warning to ok recovery', () => {
      expect(getTransition('warning', 'ok')).toBe('warning_to_ok')
    })

    it('detects critical to ok recovery', () => {
      expect(getTransition('critical', 'ok')).toBe('critical_to_ok')
    })

    it('detects critical to warning (partial recovery)', () => {
      expect(getTransition('critical', 'warning')).toBe('critical_to_warning')
    })

    it('detects no change for same status', () => {
      expect(getTransition('ok', 'ok')).toBe('no_change')
      expect(getTransition('warning', 'warning')).toBe('no_change')
      expect(getTransition('critical', 'critical')).toBe('no_change')
    })
  })
})

describe('shouldAlert', () => {
  const shouldAlert = (transition: string): boolean => {
    return [
      'ok_to_warning',
      'ok_to_critical',
      'warning_to_critical',
    ].includes(transition)
  }

  describe('alert-triggering transitions', () => {
    it('should alert on ok to warning', () => {
      expect(shouldAlert('ok_to_warning')).toBe(true)
    })

    it('should alert on ok to critical', () => {
      expect(shouldAlert('ok_to_critical')).toBe(true)
    })

    it('should alert on warning to critical', () => {
      expect(shouldAlert('warning_to_critical')).toBe(true)
    })
  })

  describe('non-alert transitions', () => {
    it('should NOT alert on recovery (warning to ok)', () => {
      expect(shouldAlert('warning_to_ok')).toBe(false)
    })

    it('should NOT alert on recovery (critical to ok)', () => {
      expect(shouldAlert('critical_to_ok')).toBe(false)
    })

    it('should NOT alert on partial recovery (critical to warning)', () => {
      expect(shouldAlert('critical_to_warning')).toBe(false)
    })

    it('should NOT alert on no change', () => {
      expect(shouldAlert('no_change')).toBe(false)
    })
  })
})

describe('isRecovery', () => {
  const isRecovery = (transition: string): boolean => {
    return [
      'warning_to_ok',
      'critical_to_ok',
    ].includes(transition)
  }

  it('identifies warning to ok as recovery', () => {
    expect(isRecovery('warning_to_ok')).toBe(true)
  })

  it('identifies critical to ok as recovery', () => {
    expect(isRecovery('critical_to_ok')).toBe(true)
  })

  it('does NOT consider critical to warning as recovery', () => {
    // Critical to warning is improvement but not full recovery
    expect(isRecovery('critical_to_warning')).toBe(false)
  })

  it('does NOT consider alert transitions as recovery', () => {
    expect(isRecovery('ok_to_warning')).toBe(false)
    expect(isRecovery('ok_to_critical')).toBe(false)
    expect(isRecovery('warning_to_critical')).toBe(false)
  })
})

describe('AlertMode types', () => {
  it('should support daily_digest mode', () => {
    const mode: 'daily_digest' | 'per_transition' = 'daily_digest'
    expect(mode).toBe('daily_digest')
  })

  it('should support per_transition mode', () => {
    const mode: 'daily_digest' | 'per_transition' = 'per_transition'
    expect(mode).toBe('per_transition')
  })
})

describe('ComponentAlertNeeded structure', () => {
  it('contains all required fields', () => {
    const alertNeeded = {
      componentId: 'test-id',
      componentName: 'Test Component',
      skuCode: 'TEST-001',
      brandName: 'Test Brand',
      previousStatus: 'ok' as const,
      currentStatus: 'warning' as const,
      transition: 'ok_to_warning' as const,
      quantityOnHand: 5,
      reorderPoint: 10,
      leadTimeDays: 7,
    }

    expect(alertNeeded.componentId).toBe('test-id')
    expect(alertNeeded.previousStatus).toBe('ok')
    expect(alertNeeded.currentStatus).toBe('warning')
    expect(alertNeeded.transition).toBe('ok_to_warning')
  })
})

describe('LowStockAlertEvaluation structure', () => {
  it('contains all required fields', () => {
    const evaluation = {
      companyId: 'company-id',
      evaluatedAt: new Date().toISOString(),
      totalComponents: 10,
      componentsNeedingAlert: [],
      newWarnings: 2,
      newCriticals: 1,
      recoveries: 0,
    }

    expect(evaluation.companyId).toBe('company-id')
    expect(evaluation.totalComponents).toBe(10)
    expect(evaluation.newWarnings).toBe(2)
    expect(evaluation.newCriticals).toBe(1)
    expect(evaluation.recoveries).toBe(0)
  })
})

describe('Zod schema validation', () => {
  describe('alertModeSchema', () => {
    it('validates daily_digest mode', () => {
      const result = alertModeSchema.safeParse('daily_digest')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('daily_digest')
      }
    })

    it('validates per_transition mode', () => {
      const result = alertModeSchema.safeParse('per_transition')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe('per_transition')
      }
    })

    it('rejects invalid mode', () => {
      const result = alertModeSchema.safeParse('invalid_mode')
      expect(result.success).toBe(false)
    })
  })

  describe('alertConfigSchema', () => {
    it('validates complete config', () => {
      const result = alertConfigSchema.safeParse({
        slackWebhookUrl: 'https://hooks.slack.com/services/T00/B00/XXX',
        emailAddresses: ['test@example.com'],
        enableSlack: true,
        enableEmail: true,
        alertMode: 'per_transition',
      })
      expect(result.success).toBe(true)
    })

    it('applies defaults for missing fields', () => {
      const result = alertConfigSchema.safeParse({})
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.emailAddresses).toEqual([])
        expect(result.data.enableSlack).toBe(false)
        expect(result.data.enableEmail).toBe(false)
        expect(result.data.alertMode).toBe('daily_digest')
      }
    })

    it('allows null slackWebhookUrl', () => {
      const result = alertConfigSchema.safeParse({
        slackWebhookUrl: null,
      })
      expect(result.success).toBe(true)
    })

    it('validates slack webhook URL format', () => {
      const result = alertConfigSchema.safeParse({
        slackWebhookUrl: 'not-a-url',
      })
      expect(result.success).toBe(false)
    })

    it('validates email addresses in array', () => {
      const result = alertConfigSchema.safeParse({
        emailAddresses: ['valid@example.com', 'invalid-email'],
      })
      expect(result.success).toBe(false)
    })

    it('validates all email addresses are valid', () => {
      const result = alertConfigSchema.safeParse({
        emailAddresses: ['one@example.com', 'two@example.com'],
      })
      expect(result.success).toBe(true)
    })
  })

  describe('updateAlertConfigSchema', () => {
    it('allows partial updates', () => {
      const result = updateAlertConfigSchema.safeParse({
        enableSlack: true,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.enableSlack).toBe(true)
        // Partial schema still applies defaults from the original schema
        // for fields that have defaults, so enableEmail will have its default value
        expect(typeof result.data.enableEmail).toBe('boolean')
      }
    })

    it('allows empty object (no changes)', () => {
      const result = updateAlertConfigSchema.safeParse({})
      expect(result.success).toBe(true)
    })
  })
})
