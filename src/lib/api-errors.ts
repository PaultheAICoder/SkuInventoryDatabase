import type { ApiError } from '@/types'

export interface FieldErrors {
  [field: string]: string
}

export interface ParsedApiError {
  message: string
  fieldErrors: FieldErrors
  isValidationError: boolean
}

/**
 * Parse an API error response into a structured format
 * Handles both general errors and validation errors with field details
 */
export function parseApiError(data: Partial<ApiError> | undefined): ParsedApiError {
  const fieldErrors: FieldErrors = {}
  let isValidationError = false

  if (data?.details && Array.isArray(data.details)) {
    isValidationError = true
    for (const detail of data.details) {
      if (detail.field && detail.message) {
        fieldErrors[detail.field] = detail.message
      }
    }
  }

  return {
    message: data?.message || 'An unexpected error occurred',
    fieldErrors,
    isValidationError,
  }
}
