# Test Environment Implementation Plan

**Version**: 1.0
**Created**: 2025-12-04
**Purpose**: Implement isolated test database environment to protect production data during orchestrate3 workflow cycles
**Reference**: Based on entertask project patterns (`../entertask/docs/database/`, `.claude/` agents/commands)

---

## Executive Summary

This plan establishes a complete test environment separation for the trevor-inventory project to ensure:
1. Production database is **never** modified during orchestrate3 agent workflows
2. Test database receives fresh backups from production at cycle start
3. Production record counts are verified unchanged at cycle end
4. Clear documentation and role-based access control prevent accidents

---

## Port Architecture

### Single Source of Truth - Port Mapping

| Environment | Web Port | Database Port | Container Name | Database Name | Purpose |
|-------------|----------|---------------|----------------|---------------|---------|
| **Production** | **4545** | **4546** | inventory-db-prod | inventory | Real user data - PROTECTED |
| **Test** | **2345** | **2346** | inventory-db-test | inventory_test | Agent workflows - DISPOSABLE |

**Port Numbering Strategy**:
- Production uses 45xx range (established)
- Test uses 23xx range (new - per user request)

---

## Task List

The implementing agent should update this checklist as they progress:

### Phase 1: Database Infrastructure
- [ ] **1.1** Create `docker/docker-compose.test.yml` for test environment
- [ ] **1.2** Create PostgreSQL configuration for test database roles
- [ ] **1.3** Update `.env.example` with test database variables
- [ ] **1.4** Create `.env.test` template file

### Phase 2: Database Roles and Permissions
- [ ] **2.1** Create database role setup script (`scripts/setup-database-roles.sh`)
- [ ] **2.2** Implement role-based access control:
  - `inventory_admin` - Superuser for migrations/restores only
  - `inventory_app` - Read/Write for app (NO DELETE on production)
  - `inventory_test` - Full access for test database

### Phase 3: Backup and Restore Scripts
- [ ] **3.1** Create backup script (`scripts/backup-production.sh`) with max 5 rotation
- [ ] **3.2** Create test database reseed script (`scripts/reseed-test-database.sh`)
- [ ] **3.3** Create production verification script (`scripts/verify-production-integrity.sh`)
- [ ] **3.4** Create `.backups/` folder with `.gitkeep`

### Phase 4: Update orchestrate3 Command
- [ ] **4.1** Add Pre-Workflow: Backup production database
- [ ] **4.2** Add Pre-Workflow: Reseed test database from backup
- [ ] **4.3** Add Post-Workflow: Verify production record count unchanged
- [ ] **4.4** Add database targeting documentation to orchestrate3.md

### Phase 5: Create Shared Context Document
- [ ] **5.1** Create `docs/agents/SHARED-CONTEXT.md` for database safety protocols
- [ ] **5.2** Update all agents to reference SHARED-CONTEXT.md

### Phase 6: Update All Agents to be Test-Aware
- [ ] **6.1** Update `.claude/agents/scout-and-plan.md` with test environment safety
- [ ] **6.2** Update `.claude/agents/build.md` with test database targeting and pre-build reseed
- [ ] **6.3** Update `.claude/agents/test-and-cleanup.md` with production verification

### Phase 7: Documentation
- [ ] **7.1** Create `docs/database/DATABASE-CREDENTIALS.md`
- [ ] **7.2** Create `docs/database/PROTECTION-STRATEGY.md`
- [ ] **7.3** Create `docs/database/DATABASE-OPERATIONS-RUNBOOK.md`
- [ ] **7.4** Update `CLAUDE.md` with test environment section

### Phase 8: Verification
- [ ] **8.1** Create GitHub issue for verification test
- [ ] **8.2** Start test database containers
- [ ] **8.3** Run complete orchestrate3 cycle against verification issue
- [ ] **8.4** Confirm production database unchanged after cycle
- [ ] **8.5** Document verification results

---

## Detailed Implementation Instructions

### Phase 1: Database Infrastructure

#### 1.1 Create docker/docker-compose.test.yml

```yaml
# docker/docker-compose.test.yml
# Test environment Docker services
# IMPORTANT: This runs in PARALLEL with production, NOT as a replacement

services:
  app-test:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    container_name: inventory-app-test
    restart: unless-stopped
    ports:
      - '2345:4500'
    environment:
      - NODE_ENV=test
      - DATABASE_URL=postgresql://inventory_test:inventory_test_2025@db-test:5432/inventory_test
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - NEXTAUTH_URL=http://172.16.20.50:2345
      - INTERNAL_API_URL=http://127.0.0.1:4500
    depends_on:
      db-test:
        condition: service_healthy
    healthcheck:
      test: ['CMD', 'wget', '-q', '--spider', 'http://127.0.0.1:4500/api/health']
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s

  db-test:
    image: postgres:16-alpine
    container_name: inventory-db-test
    restart: unless-stopped
    ports:
      - '2346:5432'
    environment:
      POSTGRES_USER: inventory_test
      POSTGRES_PASSWORD: inventory_test_2025
      POSTGRES_DB: inventory_test
    volumes:
      - postgres_data_test:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U inventory_test -d inventory_test']
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data_test:
```

**Key Points**:
- Uses separate volume `postgres_data_test` (isolated from production)
- Different container names (`inventory-app-test`, `inventory-db-test`)
- Different ports (2345 for web, 2346 for database)
- Different database name (`inventory_test`)
- Different user credentials (`inventory_test`)

#### 1.2 PostgreSQL Role Configuration

The test database uses a simpler role model than production:
- **Production**: Role-based access control (admin, app with restricted DELETE)
- **Test**: Single `inventory_test` superuser (tests need full flexibility)

#### 1.3 Update .env.example

Add the following section:

```bash
# ============================================================================
# TEST ENVIRONMENT CONFIGURATION
# ============================================================================
# These variables are used when running against the test database
# Test environment runs on ports 2345 (web) and 2346 (database)

# Test Database URL
# Used by test containers and orchestrate3 workflow
TEST_DATABASE_URL=postgresql://inventory_test:inventory_test_2025@localhost:2346/inventory_test

# Test NextAuth URL (for test app container)
TEST_NEXTAUTH_URL=http://172.16.20.50:2345
```

#### 1.4 Create .env.test

```bash
# .env.test
# Environment file for test database connections
# This file is loaded when running scripts against the test environment

DATABASE_URL=postgresql://inventory_test:inventory_test_2025@localhost:2346/inventory_test
NEXTAUTH_URL=http://172.16.20.50:2345
NODE_ENV=test
```

---

### Phase 2: Database Roles and Permissions

#### 2.1 Create scripts/setup-database-roles.sh

```bash
#!/bin/bash
# scripts/setup-database-roles.sh
# Creates role-based access control for production database protection

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "============================================"
echo "Database Role Setup - Trevor Inventory"
echo "============================================"
echo ""

# Production database roles (on port 4546)
echo "Setting up production database roles..."

docker exec inventory-db-prod psql -U postgres -d postgres << 'EOSQL'
-- Create admin role (for migrations, restores, schema changes)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'inventory_admin') THEN
        CREATE ROLE inventory_admin WITH LOGIN PASSWORD 'inventory_admin_2025_secure' SUPERUSER;
        RAISE NOTICE 'Created inventory_admin role';
    ELSE
        RAISE NOTICE 'inventory_admin role already exists';
    END IF;
END $$;

-- Create app role (for application runtime - NO DELETE on critical tables)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'inventory_app') THEN
        CREATE ROLE inventory_app WITH LOGIN PASSWORD 'inventory_app_2025';
        RAISE NOTICE 'Created inventory_app role';
    ELSE
        RAISE NOTICE 'inventory_app role already exists';
    END IF;
END $$;

-- Grant permissions to app role
GRANT CONNECT ON DATABASE inventory TO inventory_app;
GRANT USAGE ON SCHEMA public TO inventory_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO inventory_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO inventory_app;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO inventory_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO inventory_app;

RAISE NOTICE 'Production roles configured successfully';
EOSQL

echo ""
echo "✅ Production database roles configured"
echo ""
echo "Roles created:"
echo "  - inventory_admin (superuser - for migrations/restores)"
echo "  - inventory_app (read/write - NO DELETE)"
echo ""
echo "Credentials:"
echo "  - inventory_admin: inventory_admin_2025_secure"
echo "  - inventory_app: inventory_app_2025"
echo ""
```

---

### Phase 3: Backup and Restore Scripts

#### 3.1 Create scripts/backup-production.sh

```bash
#!/bin/bash
# scripts/backup-production.sh
# Creates backup of production database with max 5 rotation
#
# USAGE:
#   ./scripts/backup-production.sh           # Creates timestamped backup
#   ./scripts/backup-production.sh <issue>   # Creates backup tagged with issue number

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_ROOT/.backups"
DOCKER_DIR="$PROJECT_ROOT/docker"

# Get issue tag if provided
ISSUE_TAG="${1:-$(date +%s)}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/inventory_backup_${ISSUE_TAG}_${TIMESTAMP}.sql"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}           Production Database Backup${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""

# Create backup directory if needed
mkdir -p "$BACKUP_DIR"

# BACKUP ROTATION: Keep maximum of 5 backups
echo "Checking backup rotation (max 5 backups)..."
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "inventory_backup_*.sql" -type f -size +0 2>/dev/null | wc -l | xargs)
echo "  Current backups: $BACKUP_COUNT"

if [ "$BACKUP_COUNT" -ge 5 ]; then
    DELETE_COUNT=$((BACKUP_COUNT - 4))
    echo -e "  ${YELLOW}Deleting $DELETE_COUNT oldest backup(s)...${NC}"

    find "$BACKUP_DIR" -name "inventory_backup_*.sql" -type f -size +0 -print0 | \
        xargs -0 ls -t | \
        tail -n "$DELETE_COUNT" | \
        while read -r OLD_BACKUP; do
            if [ -n "$OLD_BACKUP" ] && [ -f "$OLD_BACKUP" ]; then
                echo "    Deleting: $(basename "$OLD_BACKUP")"
                rm -f "$OLD_BACKUP"
            fi
        done
fi
echo ""

# Verify production container is running
if ! docker ps | grep -q inventory-db-prod; then
    echo -e "${RED}ERROR: Production database container not running${NC}"
    echo "  Start with: cd docker && docker compose -f docker-compose.prod.yml up -d db"
    exit 1
fi

# Get pre-backup record counts for verification
echo "Pre-backup data verification..."
COMPONENT_COUNT=$(docker exec inventory-db-prod psql -U postgres -d inventory -t -c "SELECT COUNT(*) FROM \"Component\";" 2>/dev/null | xargs || echo "0")
SKU_COUNT=$(docker exec inventory-db-prod psql -U postgres -d inventory -t -c "SELECT COUNT(*) FROM \"SKU\";" 2>/dev/null | xargs || echo "0")
TRANSACTION_COUNT=$(docker exec inventory-db-prod psql -U postgres -d inventory -t -c "SELECT COUNT(*) FROM \"Transaction\";" 2>/dev/null | xargs || echo "0")

echo "  Components: $COMPONENT_COUNT"
echo "  SKUs: $SKU_COUNT"
echo "  Transactions: $TRANSACTION_COUNT"
echo ""

# Create backup
echo "Creating backup: $(basename "$BACKUP_FILE")"
docker exec inventory-db-prod pg_dump -U postgres -d inventory --clean --if-exists -F c > "$BACKUP_FILE"

# Verify backup created
if [ ! -f "$BACKUP_FILE" ] || [ ! -s "$BACKUP_FILE" ]; then
    echo -e "${RED}ERROR: Backup file not created or empty${NC}"
    exit 1
fi

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

echo ""
echo -e "${GREEN}✅ Backup complete${NC}"
echo "  File: $(basename "$BACKUP_FILE")"
echo "  Size: $SIZE"
echo "  Components: $COMPONENT_COUNT"
echo "  SKUs: $SKU_COUNT"
echo "  Transactions: $TRANSACTION_COUNT"
echo ""

# Output for script consumption
echo "BACKUP_FILE=$BACKUP_FILE"
echo "COMPONENT_COUNT=$COMPONENT_COUNT"
echo "SKU_COUNT=$SKU_COUNT"
echo "TRANSACTION_COUNT=$TRANSACTION_COUNT"
```

#### 3.2 Create scripts/reseed-test-database.sh

```bash
#!/bin/bash
# scripts/reseed-test-database.sh
# Restores test database from most recent production backup
#
# PURPOSE: Ensures test database has current "good" data from production
# before each orchestrate3 cycle
#
# SAFETY: Only targets test database (inventory_test on port 2346)
#         NEVER touches production database
#
# USAGE:
#   ./scripts/reseed-test-database.sh                    # Use latest backup
#   ./scripts/reseed-test-database.sh /path/to/backup    # Use specific backup
#   ./scripts/reseed-test-database.sh --force            # Force restore even if populated

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_ROOT/.backups"
DOCKER_DIR="$PROJECT_ROOT/docker"

# HARDCODED TEST DATABASE CONFIGURATION - NEVER CHANGE
TEST_DB_USER="inventory_test"
TEST_DB_PASSWORD="inventory_test_2025"
TEST_DB_NAME="inventory_test"
TEST_DB_CONTAINER="inventory-db-test"
TEST_DB_PORT="2345"

# Parse arguments
FORCE_RESTORE=false
BACKUP_FILE=""

for arg in "$@"; do
    case "$arg" in
        --force|-f)
            FORCE_RESTORE=true
            ;;
        *)
            BACKUP_FILE="$arg"
            ;;
    esac
done

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}           Test Database Reseed - Safety Verification${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

# Verify test container is running
if ! docker ps | grep -q "$TEST_DB_CONTAINER"; then
    echo -e "${RED}ERROR: Test database container not running${NC}"
    echo "  Start with: cd docker && docker compose -f docker-compose.test.yml up -d"
    exit 1
fi
echo -e "${GREEN}✓${NC} Test database container is running"

# Find backup file
if [ -z "$BACKUP_FILE" ]; then
    BACKUP_FILE=$(ls -t "$BACKUP_DIR"/inventory_backup_*.sql 2>/dev/null | head -1)
fi

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}ERROR: No backup file found${NC}"
    echo "  Create backup first: ./scripts/backup-production.sh"
    exit 1
fi

echo -e "${GREEN}✓${NC} Backup file: $(basename "$BACKUP_FILE")"
echo ""

# Check current test database status
CURRENT_COUNT=$(docker exec "$TEST_DB_CONTAINER" psql -U "$TEST_DB_USER" -d "$TEST_DB_NAME" -t -c \
    "SELECT COUNT(*) FROM \"Component\";" 2>/dev/null | xargs || echo "0")

THRESHOLD=10
echo "Current test database: $CURRENT_COUNT components"

if [ "$FORCE_RESTORE" = "true" ]; then
    echo -e "${YELLOW}Force restore requested${NC}"
    SKIP_RESTORE=false
elif [ "$CURRENT_COUNT" -ge "$THRESHOLD" ]; then
    echo -e "${GREEN}Database already populated - skipping restore${NC}"
    echo "  Use --force to override"
    SKIP_RESTORE=true
else
    echo "Database needs restoration"
    SKIP_RESTORE=false
fi
echo ""

if [ "$SKIP_RESTORE" = "false" ]; then
    echo "Restoring test database from backup..."

    # Terminate connections
    docker exec "$TEST_DB_CONTAINER" psql -U "$TEST_DB_USER" -d postgres -c \
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$TEST_DB_NAME' AND pid <> pg_backend_pid();" \
        >/dev/null 2>&1 || true

    # Drop and recreate
    docker exec "$TEST_DB_CONTAINER" psql -U "$TEST_DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $TEST_DB_NAME;" >/dev/null 2>&1
    docker exec "$TEST_DB_CONTAINER" psql -U "$TEST_DB_USER" -d postgres -c "CREATE DATABASE $TEST_DB_NAME OWNER $TEST_DB_USER;" >/dev/null 2>&1

    # Restore from backup
    docker cp "$BACKUP_FILE" "$TEST_DB_CONTAINER":/tmp/restore.dump
    docker exec "$TEST_DB_CONTAINER" pg_restore -U "$TEST_DB_USER" -d "$TEST_DB_NAME" \
        --no-owner --no-privileges /tmp/restore.dump 2>/dev/null || true
    docker exec "$TEST_DB_CONTAINER" rm -f /tmp/restore.dump

    echo -e "${GREEN}✓${NC} Restore complete"
fi

# Verify final state
FINAL_COUNT=$(docker exec "$TEST_DB_CONTAINER" psql -U "$TEST_DB_USER" -d "$TEST_DB_NAME" -t -c \
    "SELECT COUNT(*) FROM \"Component\";" 2>/dev/null | xargs || echo "0")

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Test Database Ready${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Database: $TEST_DB_NAME (port $TEST_DB_PORT)"
echo "  Components: $FINAL_COUNT"
echo "  Access: http://172.16.20.50:2345"
echo ""
```

#### 3.3 Create scripts/verify-production-integrity.sh

```bash
#!/bin/bash
# scripts/verify-production-integrity.sh
# Verifies production database was not modified during orchestrate3 cycle
#
# USAGE:
#   ./scripts/verify-production-integrity.sh <expected_components> <expected_skus> <expected_transactions>
#
# RETURNS:
#   0 = Success (counts match)
#   1 = Failure (counts differ - CRITICAL ERROR)

set -e

EXPECTED_COMPONENTS="${1:-0}"
EXPECTED_SKUS="${2:-0}"
EXPECTED_TRANSACTIONS="${3:-0}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo "Production Database Integrity Verification"
echo "==========================================="
echo ""

# Get current counts
ACTUAL_COMPONENTS=$(docker exec inventory-db-prod psql -U postgres -d inventory -t -c "SELECT COUNT(*) FROM \"Component\";" 2>/dev/null | xargs || echo "0")
ACTUAL_SKUS=$(docker exec inventory-db-prod psql -U postgres -d inventory -t -c "SELECT COUNT(*) FROM \"SKU\";" 2>/dev/null | xargs || echo "0")
ACTUAL_TRANSACTIONS=$(docker exec inventory-db-prod psql -U postgres -d inventory -t -c "SELECT COUNT(*) FROM \"Transaction\";" 2>/dev/null | xargs || echo "0")

echo "Expected vs Actual:"
echo "  Components:   $EXPECTED_COMPONENTS -> $ACTUAL_COMPONENTS"
echo "  SKUs:         $EXPECTED_SKUS -> $ACTUAL_SKUS"
echo "  Transactions: $EXPECTED_TRANSACTIONS -> $ACTUAL_TRANSACTIONS"
echo ""

# Compare
ERRORS=0

if [ "$ACTUAL_COMPONENTS" != "$EXPECTED_COMPONENTS" ]; then
    echo -e "${RED}CRITICAL: Component count changed! ($EXPECTED_COMPONENTS -> $ACTUAL_COMPONENTS)${NC}"
    ERRORS=$((ERRORS + 1))
fi

if [ "$ACTUAL_SKUS" != "$EXPECTED_SKUS" ]; then
    echo -e "${RED}CRITICAL: SKU count changed! ($EXPECTED_SKUS -> $ACTUAL_SKUS)${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Note: Transactions may increase during normal operation, only flag if DECREASED
if [ "$ACTUAL_TRANSACTIONS" -lt "$EXPECTED_TRANSACTIONS" ]; then
    echo -e "${RED}CRITICAL: Transaction count DECREASED! ($EXPECTED_TRANSACTIONS -> $ACTUAL_TRANSACTIONS)${NC}"
    ERRORS=$((ERRORS + 1))
fi

if [ "$ERRORS" -gt 0 ]; then
    echo ""
    echo -e "${RED}❌ INTEGRITY CHECK FAILED${NC}"
    echo ""
    echo "PRODUCTION DATABASE MAY HAVE BEEN MODIFIED!"
    echo "DO NOT commit or push until this is investigated."
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ Production database integrity verified${NC}"
echo "   Database unchanged during orchestrate3 cycle"
echo ""
exit 0
```

#### 3.4 Create .backups/.gitkeep

```bash
# Create empty .backups folder with .gitkeep
mkdir -p .backups
touch .backups/.gitkeep
echo "# Backup files (excluded from git)" > .backups/README.md
```

Also add to `.gitignore`:
```
# Database backups
.backups/*.sql
.backups/*.dump
```

---

### Phase 4: Update orchestrate3 Command

#### 4.1-4.4 Update .claude/commands/orchestrate3.md

Add the following sections to the beginning of the orchestrate3 command file:

```markdown
## 🚨 CRITICAL: PRODUCTION DATABASE PROTECTION 🚨

**THIS WORKFLOW PROTECTS PRODUCTION DATA**

- ✅ **Pre-Workflow**: Backup production database to `.backups/`
- ✅ **Pre-Workflow**: Reseed test database from backup
- ✅ **Post-Workflow**: Verify production record counts unchanged
- ✅ **All agents**: Work on test environment ONLY
- ❌ **Production**: NEVER modified by any agent

### Database Targeting

| Container | Port | Database | Used By |
|-----------|------|----------|---------|
| inventory-db-prod | 4546 | inventory | Production (PROTECTED) |
| inventory-db-test | 2345 | inventory_test | Agents (DISPOSABLE) |

### Pre-Workflow: Database Backup (CRITICAL)

**Purpose**: Preserve production state and capture baseline record counts

**Your Role**:
1. Report to user: "💾 Creating production database backup..."

2. Execute backup script:
   ```bash
   cd /home/pbrown/SkuInventory
   BACKUP_OUTPUT=$(bash scripts/backup-production.sh "$ISSUE_NUMBER" 2>&1)
   echo "$BACKUP_OUTPUT"

   # Extract baseline counts for post-workflow verification
   BASELINE_COMPONENTS=$(echo "$BACKUP_OUTPUT" | grep "COMPONENT_COUNT=" | cut -d= -f2)
   BASELINE_SKUS=$(echo "$BACKUP_OUTPUT" | grep "SKU_COUNT=" | cut -d= -f2)
   BASELINE_TRANSACTIONS=$(echo "$BACKUP_OUTPUT" | grep "TRANSACTION_COUNT=" | cut -d= -f2)
   ```

3. Report to user:
   ```
   ✅ Production backup complete
      Components: [count]
      SKUs: [count]
      Transactions: [count]
   ```

**Safety Rule**: If backup fails, STOP and report error. Do NOT proceed.

### Pre-Workflow: Test Database Reseed (CRITICAL)

**Purpose**: Ensure test environment has current data from production

**Your Role**:
1. Report to user: "🔄 Reseeding test database..."

2. Execute reseed script:
   ```bash
   bash scripts/reseed-test-database.sh --force
   ```

3. Report to user:
   ```
   ✅ Test database ready
      Database: inventory_test (port 2346)
      Access: http://172.16.20.50:2345
   ```

**Safety Rule**: If reseed fails, STOP and report error.

### Post-Workflow: Production Integrity Verification (CRITICAL)

**After Cleanup agent completes, BEFORE final report**:

1. Report to user: "🔍 Verifying production database integrity..."

2. Execute verification:
   ```bash
   bash scripts/verify-production-integrity.sh "$BASELINE_COMPONENTS" "$BASELINE_SKUS" "$BASELINE_TRANSACTIONS"
   ```

3. **If verification PASSES**:
   ```
   ✅ Production database integrity verified
      No data was modified during orchestrate3 cycle
   ```

4. **If verification FAILS**:
   ```
   ❌ CRITICAL: Production database may have been modified!
      DO NOT commit or push until investigated.

   [Show specific discrepancies]
   ```

   **STOP workflow immediately** - do not proceed to final report.
```

---

### Phase 5: Create Shared Context Document

#### 5.1 Create docs/agents/SHARED-CONTEXT.md

Create a shared context document that all agents reference for database safety and environment configuration. This pattern comes from entertask and ensures consistency across all agents.

```markdown
# Shared Agent Context

Reference document for all 3-agent workflow agents. Do not duplicate - reference this file.

---

## Absolute Paths Required

**ALWAYS use absolute paths** - never relative paths. Agents frequently change directories, causing relative paths to fail.

**Project root**: `/home/pbrown/SkuInventory`

---

## Environment Architecture

| Environment | Web Port | Database Port | Container | Database | User |
|-------------|----------|---------------|-----------|----------|------|
| Production | 4545 | 4546 | `inventory-db-prod` | `inventory` | `postgres` (PROTECTED) |
| Test | 2345 | 2346 | `inventory-db-test` | `inventory_test` | `inventory_test` (full access) |

---

## Database Safety Protocol

**NEVER modify production database (port 4546/inventory).**

- All agent work targets TEST environment only
- Reseed test DB: `./scripts/reseed-test-database.sh --force`
- Verify test connection before any database operations

**Commands must explicitly target test**:
```bash
# Correct - targets test database
docker exec inventory-db-test psql -U inventory_test -d inventory_test

# Wrong - could hit production
docker exec inventory-db-prod psql -U postgres -d inventory
```

**Prisma commands with test database**:
```bash
DATABASE_URL="postgresql://inventory_test:inventory_test_2025@localhost:2346/inventory_test" npx prisma migrate deploy
```

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

---

## Output File Locations

| Type | Path |
|------|------|
| Agent outputs | `.agents/outputs/[agent]-[ISSUE]-[MMDDYY].md` |
| Timing | `.agents/timing/issue-[NUMBER]-timing.json` |
| Completion docs | `completion-docs/YYYY-MM-DD-issue-XXX-description.md` |

**All paths relative to project root** (`/home/pbrown/SkuInventory/`)

---

## Agent Return Format

Each agent ends with:
```
AGENT_RETURN: [agent]-[ISSUE_NUMBER]-[MMDDYY]
```

Example: `AGENT_RETURN: build-42-120425`
```

#### 5.2 Update All Agents to Reference SHARED-CONTEXT.md

Add the following line to each agent file after the frontmatter:

```markdown
**Shared Context**: See `/home/pbrown/SkuInventory/docs/agents/SHARED-CONTEXT.md` for database safety, timing format, output paths.
```

---

### Phase 6: Update All Agents to be Test-Aware

#### 6.1 Update scout-and-plan.md

Add after the header section:

```markdown
## 🚨 DATABASE SAFETY PROTOCOL 🚨

**MANDATORY: This agent operates on TEST environment ONLY**

- ✅ Target: Test database (`inventory_test` on port 2346)
- ❌ Never: Query or modify production database (port 4546)

**For ANY database operations:**
- Use test container: `inventory-db-test`
- Use test database: `inventory_test`
- Use test URL: http://172.16.20.50:2345

**Verification Command:**
```bash
# Verify targeting test environment
docker exec inventory-db-test psql -U inventory_test -d inventory_test -c "SELECT current_database();"
# Expected: inventory_test
```
```

#### 6.2 Update build.md

Add to Pre-Build Verification section (and add SHARED-CONTEXT reference at top):

```markdown
## 🚨 DATABASE SAFETY PROTOCOL 🚨

**All database operations target TEST environment**

```bash
# Verify test database connection
docker exec inventory-db-test psql -U inventory_test -d inventory_test -c "SELECT 1;"

# For Prisma commands, use test DATABASE_URL
DATABASE_URL="postgresql://inventory_test:inventory_test_2025@localhost:2346/inventory_test" npx prisma migrate deploy
```

**NEVER run these on production:**
- `prisma migrate reset`
- `prisma db push --force-reset`
- Direct SQL to inventory-db-prod
```

#### 6.3 Update test-and-cleanup.md

Add to PHASE B: CLEANUP & FINALIZATION section (and add SHARED-CONTEXT reference at top):

```markdown
## B0. Production Integrity Check (MANDATORY)

**Before any git operations, verify production database unchanged:**

This check is performed by the orchestrator, but if you need to verify manually:

```bash
# Compare current production counts to baseline
docker exec inventory-db-prod psql -U postgres -d inventory -c "
SELECT
    (SELECT COUNT(*) FROM \"Component\") as components,
    (SELECT COUNT(*) FROM \"SKU\") as skus,
    (SELECT COUNT(*) FROM \"Transaction\") as transactions;
"
```

**If counts differ from workflow start, STOP immediately and report.**
```

---

### Phase 7: Documentation

#### 7.1 Create docs/database/DATABASE-CREDENTIALS.md

```markdown
# Database Credentials and Access Control

**Last Updated**: [Implementation Date]
**Purpose**: Track all database roles, credentials, and access patterns

---

## Production Database (Port 4546)

### Container: inventory-db-prod

#### 1. `postgres` (Default Superuser)
**Purpose**: Initial setup and emergency access only
**Password**: Value of POSTGRES_PASSWORD env var
**When to Use**:
- Initial database creation
- Emergency recovery
- Creating other roles
**DO NOT USE for**: Application runtime, agent workflows

#### 2. `inventory_admin` (Admin Role)
**Purpose**: Migrations, restores, schema changes
**Password**: `inventory_admin_2025_secure`
**Permissions**: Full superuser
**When to Use**:
- Running Prisma migrations
- Database restores
- Schema modifications
**When NOT to Use**: Application runtime

#### 3. `inventory_app` (Application Role)
**Purpose**: Application runtime (Next.js + Prisma)
**Password**: `inventory_app_2025`
**Permissions**: SELECT, INSERT, UPDATE (NO DELETE on critical tables)
**When to Use**:
- Normal application operation
- API requests
**Blast Radius Protection**: Cannot DROP tables or TRUNCATE data

---

## Test Database (Port 2345)

### Container: inventory-db-test

#### 1. `inventory_test` (Test Superuser)
**Purpose**: Test environment with full flexibility
**Password**: `inventory_test_2025`
**Permissions**: Full superuser (DROP, DELETE, TRUNCATE allowed)
**Why Full Access**: Tests need to:
- Reset data between tests
- Truncate tables
- Run destructive operations safely

**Connection String:**
```
postgresql://inventory_test:inventory_test_2025@localhost:2346/inventory_test
```

---

## Connection Examples

### From Host Machine

```bash
# Production (read-only verification)
PGPASSWORD=inventory_app_2025 psql -h localhost -p 4546 -U inventory_app -d inventory

# Test (full access)
PGPASSWORD=inventory_test_2025 psql -h localhost -p 2345 -U inventory_test -d inventory_test
```

### From Docker Containers

```bash
# Production admin (for migrations)
docker exec inventory-db-prod psql -U inventory_admin -d inventory

# Test (for agent workflows)
docker exec inventory-db-test psql -U inventory_test -d inventory_test
```

---

## Troubleshooting

### "Permission denied for table X"
- Check which role you're using
- Production `inventory_app` cannot DELETE - use `inventory_admin` if needed

### "Role does not exist"
Run: `./scripts/setup-database-roles.sh`

---

## Security Notes

- Credentials in this file are for local development
- Production deployment should use secrets management
- Rotate passwords after any suspected exposure
```

#### 7.2 Create docs/database/PROTECTION-STRATEGY.md

```markdown
# Production Database Protection Strategy

**Status**: 🟢 ALL PROTECTIONS ACTIVE
**Purpose**: Prevent accidental corruption during agent workflows

---

## Protection Layers

### Layer 1: Environment Isolation
- Production: port 4546, container `inventory-db-prod`
- Test: port 2346, container `inventory-db-test`
- Separate Docker volumes (data isolation)

### Layer 2: Role-Based Access Control
- `inventory_app`: NO DELETE on production
- Agents target test database only

### Layer 3: Backup Rotation
- Maximum 5 backups retained
- Automatic rotation (oldest deleted)
- Location: `.backups/`

### Layer 4: Pre/Post Workflow Verification
- **Pre**: Backup production, record baseline counts
- **Post**: Verify counts unchanged

### Layer 5: Agent Safety Protocols
- All agents document test database targeting
- No production access in agent instructions

---

## orchestrate3 Workflow Protection

```
START orchestrate3
    │
    ├── 💾 Backup production database
    │   └── Record baseline: Components, SKUs, Transactions
    │
    ├── 🔄 Reseed test database
    │   └── Copy production backup to test
    │
    ├── 🤖 Run agents (Scout → Build → Test)
    │   └── ALL work on test database only
    │
    ├── 🔍 Verify production integrity
    │   └── Compare current counts to baseline
    │
    └── ✅ PASS: Commit and push
        ❌ FAIL: STOP - investigate
```

---

## Emergency Recovery

If production database is accidentally modified:

1. **STOP immediately** - do not commit/push
2. **Restore from backup**:
   ```bash
   # List available backups
   ls -la .backups/

   # Restore most recent
   docker exec inventory-db-prod pg_restore -U postgres -d inventory --clean \
       /path/to/backup.sql
   ```
3. **Investigate cause** - update agent safety protocols
```

#### 7.3 Create docs/database/DATABASE-OPERATIONS-RUNBOOK.md

(Similar to entertask's runbook - include common operations, port reference, starting environments, etc.)

#### 7.4 Update CLAUDE.md

Add to the Port Convention section:

```markdown
## Test Environment

**IMPORTANT**: The test environment is isolated from production and used exclusively by orchestrate3 agent workflows.

| Service | Port | Description |
|---------|------|-------------|
| **Test Web** | **2345** | Test app for agent verification |
| **Test Database** | **2346** | Test PostgreSQL (disposable data) |

**Starting Test Environment:**
```bash
cd docker
docker compose -f docker-compose.test.yml up -d
```

**Test URL**: http://172.16.20.50:2345

**Database Protection**: The orchestrate3 workflow automatically:
1. Backs up production before each cycle
2. Reseeds test database from production backup
3. Verifies production unchanged after cycle

See `docs/database/PROTECTION-STRATEGY.md` for details.
```

---

### Phase 8: Verification

#### 8.1 Create GitHub Issue for Verification

Create a GitHub issue with the following content:

**Title**: `test: Verify test database isolation for orchestrate3 workflow`

**Body**:
```markdown
## Description

This is a verification issue to test that the test database isolation is working correctly.

## Acceptance Criteria

- [ ] orchestrate3 workflow completes successfully
- [ ] Test database is used for all operations
- [ ] Production database record counts are unchanged
- [ ] Backup was created in `.backups/` folder
- [ ] Test reseed completed successfully

## Test Steps

1. Note current production record counts
2. Run `/orchestrate3 #<this-issue-number>`
3. Verify agents work on test database
4. Verify production counts unchanged at end

## Technical Details

This issue creates a simple verification task:
- Add a comment to `docs/database/PROTECTION-STRATEGY.md`
- Verify no production data is modified

## Labels

- test
- infrastructure
```

#### 8.2-8.5 Run Verification

After all implementation is complete:

1. **Start test containers**:
   ```bash
   cd docker
   docker compose -f docker-compose.test.yml up -d
   ```

2. **Run orchestrate3 against verification issue**:
   ```
   /orchestrate3 #<issue-number>
   ```

3. **Verify**:
   - Pre-workflow backup created in `.backups/`
   - Test database reseeded
   - Agents completed work
   - Post-workflow verification passed
   - Production counts unchanged

4. **Document results** in completion report

---

## Success Criteria

The implementation is complete when:

- [ ] Test and production databases run on separate ports/containers
- [ ] orchestrate3 backs up production before each cycle
- [ ] orchestrate3 reseeds test database from backup
- [ ] orchestrate3 verifies production unchanged after cycle
- [ ] All agents document test database targeting
- [ ] Database credentials documented
- [ ] Protection strategy documented
- [ ] Verification issue completes successfully
- [ ] Production data protected even if agent makes mistakes

---

## References

- **entertask Protection Strategy**: `../entertask/docs/database/PROTECTION-STRATEGY.md`
- **entertask Credentials**: `../entertask/docs/database/DATABASE-CREDENTIALS.md`
- **entertask Reseed Script**: `../entertask/scripts/reseed-test-database.sh`
- **entertask orchestrate.md**: `../entertask/.claude/commands/orchestrate.md`
