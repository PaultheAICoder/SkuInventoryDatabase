import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Global mock for version.json - needed by BuildFooter component
vi.mock('../version.json', () => ({
  default: {
    version: '0.5.1',
    buildTimestamp: '2025-12-02T18:00:00.000Z',
  },
}))
