import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execSync } from 'child_process'

/**
 * Tests for the increment-version.js script logic.
 *
 * Since the script is a CommonJS module that runs immediately on require(),
 * we test its logic by running it in a controlled environment with real
 * file system operations in a temp directory.
 */

describe('increment-version script', () => {
  const projectRoot = path.resolve(__dirname, '..', '..')
  const versionFilePath = path.join(projectRoot, 'version.json')
  const scriptPath = path.join(projectRoot, 'scripts', 'increment-version.js')
  let originalVersionContent: string | null = null

  beforeEach(() => {
    // Save original version.json content before each test
    try {
      originalVersionContent = fs.readFileSync(versionFilePath, 'utf8')
    } catch {
      originalVersionContent = null
    }
  })

  afterEach(() => {
    // Restore original version.json after each test
    if (originalVersionContent !== null) {
      fs.writeFileSync(versionFilePath, originalVersionContent, 'utf8')
    } else {
      try {
        fs.unlinkSync(versionFilePath)
      } catch {
        // File didn't exist originally
      }
    }
    // Unstage the version.json file if it was staged
    try {
      execSync('git restore --staged version.json', { cwd: projectRoot, stdio: 'pipe' })
    } catch {
      // Ignore if not staged
    }
  })

  describe('version parsing and incrementing', () => {
    it('increments patch version correctly', () => {
      // Set a known starting version
      const startVersion = { version: '1.2.3', buildTimestamp: '2025-01-01T00:00:00.000Z' }
      fs.writeFileSync(versionFilePath, JSON.stringify(startVersion, null, 2) + '\n', 'utf8')

      // Run the script
      execSync(`node ${scriptPath}`, { cwd: projectRoot, stdio: 'pipe' })

      // Read the result
      const result = JSON.parse(fs.readFileSync(versionFilePath, 'utf8'))
      expect(result.version).toBe('1.2.4')
    })

    it('handles double-digit patch versions correctly (e.g., 1.9.9 -> 1.9.10)', () => {
      const startVersion = { version: '1.9.9', buildTimestamp: '2025-01-01T00:00:00.000Z' }
      fs.writeFileSync(versionFilePath, JSON.stringify(startVersion, null, 2) + '\n', 'utf8')

      execSync(`node ${scriptPath}`, { cwd: projectRoot, stdio: 'pipe' })

      const result = JSON.parse(fs.readFileSync(versionFilePath, 'utf8'))
      expect(result.version).toBe('1.9.10')
    })

    it('updates the buildTimestamp to current time', () => {
      const oldTimestamp = '2020-01-01T00:00:00.000Z'
      const startVersion = { version: '1.0.0', buildTimestamp: oldTimestamp }
      fs.writeFileSync(versionFilePath, JSON.stringify(startVersion, null, 2) + '\n', 'utf8')

      const beforeTest = new Date()
      execSync(`node ${scriptPath}`, { cwd: projectRoot, stdio: 'pipe' })
      const afterTest = new Date()

      const result = JSON.parse(fs.readFileSync(versionFilePath, 'utf8'))
      const resultTimestamp = new Date(result.buildTimestamp)

      // Verify timestamp is updated and within test execution window
      expect(resultTimestamp.getTime()).toBeGreaterThanOrEqual(beforeTest.getTime())
      expect(resultTimestamp.getTime()).toBeLessThanOrEqual(afterTest.getTime())
      expect(result.buildTimestamp).not.toBe(oldTimestamp)
    })
  })

  describe('missing version.json handling', () => {
    it('creates default version.json if file is missing', () => {
      // Use a temp directory to avoid deleting the real version.json
      // which could cause race conditions with other tests
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'increment-version-test-'))
      const tempVersionFile = path.join(tempDir, 'version.json')

      try {
        // Run the script with custom path - it should create a default
        const output = execSync(`node ${scriptPath}`, {
          cwd: projectRoot,
          encoding: 'utf8',
          env: { ...process.env, VERSION_FILE_PATH: tempVersionFile }
        })

        // File should now exist
        expect(fs.existsSync(tempVersionFile)).toBe(true)

        const result = JSON.parse(fs.readFileSync(tempVersionFile, 'utf8'))
        // Default starts at 0.5.0 and gets incremented to 0.5.1
        expect(result.version).toBe('0.5.1')
        expect(result.buildTimestamp).toBeDefined()
        expect(output).toContain('version.json not found')
      } finally {
        // Clean up temp directory
        try {
          fs.rmSync(tempDir, { recursive: true })
        } catch {
          // Ignore cleanup errors
        }
      }
    })
  })

  describe('invalid version format handling', () => {
    it('exits with error for invalid version format (not semver)', () => {
      const invalidVersion = { version: '1.2', buildTimestamp: '2025-01-01T00:00:00.000Z' }
      fs.writeFileSync(versionFilePath, JSON.stringify(invalidVersion, null, 2) + '\n', 'utf8')

      expect(() => {
        execSync(`node ${scriptPath}`, { cwd: projectRoot, stdio: 'pipe' })
      }).toThrow()
    })

    it('exits with error for non-numeric version parts', () => {
      const invalidVersion = { version: 'a.b.c', buildTimestamp: '2025-01-01T00:00:00.000Z' }
      fs.writeFileSync(versionFilePath, JSON.stringify(invalidVersion, null, 2) + '\n', 'utf8')

      expect(() => {
        execSync(`node ${scriptPath}`, { cwd: projectRoot, stdio: 'pipe' })
      }).toThrow()
    })
  })

  describe('console output', () => {
    it('logs the version bump message', () => {
      const startVersion = { version: '2.3.4', buildTimestamp: '2025-01-01T00:00:00.000Z' }
      fs.writeFileSync(versionFilePath, JSON.stringify(startVersion, null, 2) + '\n', 'utf8')

      const output = execSync(`node ${scriptPath}`, { cwd: projectRoot, encoding: 'utf8' })

      expect(output).toContain('Version bumped: 2.3.4 -> 2.3.5')
    })
  })

  describe('version.json format', () => {
    it('writes properly formatted JSON with indentation', () => {
      const startVersion = { version: '1.0.0', buildTimestamp: '2025-01-01T00:00:00.000Z' }
      fs.writeFileSync(versionFilePath, JSON.stringify(startVersion, null, 2) + '\n', 'utf8')

      execSync(`node ${scriptPath}`, { cwd: projectRoot, stdio: 'pipe' })

      const content = fs.readFileSync(versionFilePath, 'utf8')
      // Should have newlines (indented JSON)
      expect(content).toContain('\n')
      // Should end with a newline
      expect(content.endsWith('\n')).toBe(true)
    })
  })
})
