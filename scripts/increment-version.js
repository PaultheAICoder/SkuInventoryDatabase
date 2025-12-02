#!/usr/bin/env node
/**
 * Auto-increment patch version and update timestamp before each commit.
 * Called by .husky/pre-commit hook.
 *
 * Usage: node scripts/increment-version.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const VERSION_FILE = path.join(__dirname, '..', 'version.json');

function main() {
  // Read current version
  let versionData;
  try {
    const content = fs.readFileSync(VERSION_FILE, 'utf8');
    versionData = JSON.parse(content);
  } catch {
    // Create default if missing
    console.log('version.json not found, creating with default 0.5.0');
    versionData = { version: '0.5.0', buildTimestamp: new Date().toISOString() };
  }

  // Parse semver and increment patch
  const parts = versionData.version.split('.');
  if (parts.length !== 3) {
    console.error('Invalid version format. Expected x.y.z');
    process.exit(1);
  }

  const major = parseInt(parts[0], 10);
  const minor = parseInt(parts[1], 10);
  const patch = parseInt(parts[2], 10);

  if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
    console.error('Invalid version numbers');
    process.exit(1);
  }

  // Increment patch version
  const newVersion = `${major}.${minor}.${patch + 1}`;
  const newTimestamp = new Date().toISOString();

  // Update version data
  versionData.version = newVersion;
  versionData.buildTimestamp = newTimestamp;

  // Write back
  fs.writeFileSync(VERSION_FILE, JSON.stringify(versionData, null, 2) + '\n', 'utf8');
  console.log(`Version bumped: ${major}.${minor}.${patch} -> ${newVersion}`);

  // Stage the updated file
  try {
    execSync('git add version.json', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  } catch {
    console.error('Failed to stage version.json');
    process.exit(1);
  }
}

main();
