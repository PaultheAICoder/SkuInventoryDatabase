# Shared Agent Context

Reference document for all orchestrate3/orchestrate5 workflow agents. Do not duplicate this information - reference this file.

**Last Updated**: 2025-12-04

---

## Absolute Paths Required

**ALWAYS use absolute paths** - never relative paths. Agents frequently change directories, causing relative paths to fail.

**Project root**: `/home/pbrown/SkuInventory`

---

## Environment Architecture

| Environment | Web Port | Database Port | Container | Database | User |
|-------------|----------|---------------|-----------|----------|------|
| **Production** | 4545 | 4546 | `inventory-db-prod` | `inventory` | `postgres` (PROTECTED) |
| **Test** | 2345 | 2346 | `inventory-db-test` | `inventory_test` | `inventory_test` (full access) |

**Production URL**: http://172.16.20.50:4545
**Test URL**: http://172.16.20.50:2345

---

## Database Safety Protocol

### CRITICAL RULE

**NEVER modify production database (port 4546 / container `inventory-db-prod`).**

All agent work MUST target the TEST environment only.

### Pre-Workflow (orchestrator handles)

1. **Backup production**: `./scripts/backup-production.sh`
2. **Reseed test database**: `./scripts/reseed-test-database.sh --force`

### During Workflow (agents must follow)

- All database operations target test environment
- Use test container: `inventory-db-test`
- Use test database: `inventory_test`
- Use test URL: http://172.16.20.50:2345

### Post-Workflow (orchestrator handles)

- Verify production unchanged: `./scripts/verify-production-integrity.sh`

---

## Database Connection Examples

### Correct - Targets TEST database

```bash
# Direct psql to test container
docker exec inventory-db-test psql -U inventory_test -d inventory_test

# Prisma commands with test DATABASE_URL
DATABASE_URL="postgresql://inventory_test:inventory_test_2025@localhost:2346/inventory_test" npx prisma migrate deploy

# Verify targeting test
docker exec inventory-db-test psql -U inventory_test -d inventory_test -c "SELECT current_database();"
# Expected output: inventory_test
```

### WRONG - Could hit production (NEVER DO THIS)

```bash
# WRONG: Production container
docker exec inventory-db-prod psql -U postgres -d inventory

# WRONG: Production port
psql -h localhost -p 4546 -U postgres -d inventory
```

---

## TESTING REQUIREMENTS (CRITICAL)

### ALL Testing MUST Use Test Environment

| Test Type | Target | Port | URL |
|-----------|--------|------|-----|
| E2E Tests | Test environment | 2345 | http://172.16.20.50:2345 |
| API Tests | Test environment | 2345 | http://172.16.20.50:2345/api/* |
| Database Tests | Test database | 2346 | inventory_test |
| **NEVER** | Production | 4545/4546 | FORBIDDEN |

### E2E Test Configuration

**ALWAYS run E2E tests against the test environment:**

```bash
# CORRECT: Target test environment
TEST_BASE_URL=http://172.16.20.50:2345 npm run test:e2e

# WRONG: Never target production (4545)
npm run test:e2e  # If baseURL defaults to 4545, this is WRONG
```

### Test Code Requirements

Tests MUST use relative URLs (baseURL from playwright.config.ts):

```typescript
// CORRECT: Uses baseURL from config
await page.goto('/login');
await page.goto('/api/health');

// WRONG: Hardcoded production URL - NEVER DO THIS
await page.goto('http://172.16.20.50:4545/login');  // FORBIDDEN
await page.goto('http://172.16.20.50:4545/api/health');  // FORBIDDEN
```

### Database Connection in Tests

```typescript
// CORRECT: Test database connection
const testDbUrl = 'postgresql://inventory_test:inventory_test_2025@localhost:2346/inventory_test';

// WRONG: Production database - NEVER USE IN TESTS
const prodDbUrl = 'postgresql://postgres:...@localhost:4546/inventory';  // FORBIDDEN
```

### Why This Matters

- **Production (4545/4546)**: Contains REAL user data - must be protected
- **Test (2345/2346)**: Disposable data from backup - safe for testing
- Running tests against production could corrupt or delete real data

---

## Docker Compose Commands

**Production** (from project root):
```bash
cd /home/pbrown/SkuInventory/docker && docker compose -f docker-compose.prod.yml [command]
```

**Test** (from project root):
```bash
cd /home/pbrown/SkuInventory/docker && docker compose -f docker-compose.test.yml [command]
```

### Starting Test Environment

```bash
cd /home/pbrown/SkuInventory/docker
docker compose -f docker-compose.test.yml up -d
```

### Verifying Test Container

```bash
docker ps | grep inventory-db-test
# Should show: inventory-db-test running on port 2346
```

---

## Output File Locations

| Type | Path |
|------|------|
| Agent outputs | `.agents/outputs/[agent]-[ISSUE]-[MMDDYY].md` |
| Timing data | `.agents/timing/issue-[NUMBER]-timing.json` |
| Completion docs | `completion-docs/YYYY-MM-DD-issue-XXX-description.md` |

**All paths relative to project root** (`/home/pbrown/SkuInventory/`)

---

## Agent Return Format

Each agent ends with:
```
AGENT_RETURN: [agent]-[ISSUE_NUMBER]-[MMDDYY]
```

Example: `AGENT_RETURN: build-42-120425`

---

## Dangerous Commands (NEVER RUN ON PRODUCTION)

These commands are destructive and should ONLY be run on the test database:

```bash
# ONLY on test database
prisma migrate reset
prisma db push --force-reset
DROP DATABASE
TRUNCATE TABLE
DELETE FROM [table] -- without specific WHERE clause
```

---

## Test Database Credentials

```
Host: localhost
Port: 2346
Database: inventory_test
User: inventory_test
Password: inventory_test_2025

Connection String:
postgresql://inventory_test:inventory_test_2025@localhost:2346/inventory_test
```

---

## Quick Reference Card

| What | Production (PROTECTED) | Test (USE THIS) |
|------|------------------------|-----------------|
| Web URL | http://172.16.20.50:4545 | http://172.16.20.50:2345 |
| DB Port | 4546 | 2346 |
| Container | inventory-db-prod | inventory-db-test |
| Database | inventory | inventory_test |
| User | postgres | inventory_test |
