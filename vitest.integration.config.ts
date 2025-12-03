import { defineConfig } from 'vitest/config'
import path from 'path'
import fs from 'fs'

// Load .env.test for integration tests
function loadEnvFile(): Record<string, string> {
  const envPath = path.resolve(__dirname, '.env.test')
  if (!fs.existsSync(envPath)) return {}

  const content = fs.readFileSync(envPath, 'utf-8')
  const env: Record<string, string> = {}

  content.split('\n').forEach((line) => {
    const [key, ...valueParts] = line.split('=')
    if (key && valueParts.length) {
      env[key.trim()] = valueParts.join('=').trim()
    }
  })

  return env
}

const testEnv = loadEnvFile()

export default defineConfig({
  test: {
    environment: 'node', // Integration tests don't need jsdom
    globals: true,
    setupFiles: ['./tests/setup.integration.ts'],
    include: ['tests/integration/**/*.{test,spec}.{js,ts}'],
    testTimeout: 30000, // 30s timeout for DB operations
    hookTimeout: 30000,
    // Run test files sequentially to avoid database conflicts
    fileParallelism: false,
    sequence: {
      shuffle: false,
    },
    env: {
      ...testEnv,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
