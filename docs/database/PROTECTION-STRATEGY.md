# Production Database Protection Strategy

**Status**: ACTIVE
**Purpose**: Prevent accidental corruption during agent workflows

---

## Protection Layers

### Layer 1: Environment Isolation

| Environment | Web Port | DB Port | Container | Purpose |
|-------------|----------|---------|-----------|---------|
| Production | 4545 | 4546 | `inventory-db-prod` | Real data (PROTECTED) |
| Test | 2345 | 2346 | `inventory-db-test` | Disposable data (safe for agents) |

- Separate Docker volumes (data physically isolated)
- Different port ranges (45xx vs 23xx)
- Different database names (`inventory` vs `inventory_test`)

### Layer 2: Role-Based Access Control

| Role | Permissions | Used For |
|------|-------------|----------|
| `inventory_app` | SELECT, INSERT, UPDATE (NO DELETE) | Production runtime |
| `inventory_admin` | Full superuser | Migrations only |
| `inventory_test` | Full superuser | Test environment only |

**Key Protection**: Production app role cannot DELETE data

### Layer 3: Backup Rotation

- **Location**: `.backups/`
- **Retention**: Maximum 5 backups
- **Rotation**: Oldest deleted when limit reached
- **Naming**: `inventory_backup_[issue]_[timestamp].dump`

### Layer 4: Pre/Post Workflow Verification

#### Pre-Workflow (orchestrate3)
1. **Backup production database**
   - Creates timestamped backup
   - Records baseline counts (Components, SKUs, Transactions)

2. **Reseed test database**
   - Restores test from backup
   - Verifies test has data before proceeding
   - Fails catastrophically if test DB unexpectedly empty

#### Post-Workflow (orchestrate3)
1. **Verify production integrity**
   - Compares current counts to baseline
   - HALTS if counts differ
   - Prevents commit/push if integrity check fails

### Layer 5: Agent Safety Protocols

All agents (scout-and-plan, build, test-and-cleanup) include:
- Database safety section in their instructions
- Explicit test database targeting
- Reference to SHARED-CONTEXT.md

### Layer 6: Test Code Requirements

- E2E tests MUST use relative URLs
- `playwright.config.ts` uses `TEST_BASE_URL` env var
- Hardcoded production URLs (4545) are FORBIDDEN in test code

---

## orchestrate3 Workflow Protection

```
START orchestrate3
    |
    +-- BACKUP production database
    |   +-- Record baseline: Components, SKUs, Transactions
    |   +-- Save to .backups/
    |
    +-- RESEED test database
    |   +-- Check for existing tables (catastrophic fail if empty)
    |   +-- Restore from backup
    |
    +-- RUN agents (Scout-and-Plan -> Build -> Test-and-Cleanup)
    |   +-- ALL work on test database only
    |   +-- Tests run against http://172.16.20.50:2345
    |
    +-- VERIFY production integrity
    |   +-- Compare current counts to baseline
    |   +-- HALT if mismatch detected
    |
    +-- PASS: Commit and push
        FAIL: Stop - investigate
```

---

## Catastrophic Failure Handling

### Empty Test Database (Exit Code 99)

If `reseed-test-database.sh` finds NO TABLES:

1. **Script behavior**:
   - Prints CATASTROPHIC FAILURE message
   - Posts comment to GitHub issue (if `--issue` provided)
   - Exits with code 99

2. **Orchestrator behavior**:
   - HALTS workflow immediately
   - Reports failure to user
   - Does NOT proceed with agents

3. **Resolution**:
   - If intentional (first setup): Use `--fresh-start` flag
   - If unexpected: Investigate container volumes, database config

### Production Integrity Failure

If post-workflow verification detects changes:

1. **Script behavior**:
   - Prints CRITICAL error with specific discrepancies
   - Exits with non-zero code

2. **Orchestrator behavior**:
   - HALTS workflow immediately
   - Does NOT commit or push
   - Reports to user with details

3. **Resolution**:
   - Investigate which agent modified production
   - Restore from backup if needed
   - Fix agent instructions to prevent recurrence

---

## Emergency Recovery

If production database is accidentally modified:

### 1. STOP immediately
```bash
# Do not commit or push any changes
```

### 2. List available backups
```bash
ls -la .backups/
```

### 3. Restore from backup
```bash
# Identify most recent good backup
BACKUP_FILE=.backups/inventory_backup_XXX.dump

# Restore to production
docker exec -i inventory-db-prod pg_restore -U postgres -d inventory --clean \
    < "$BACKUP_FILE"
```

### 4. Verify restoration
```bash
docker exec inventory-db-prod psql -U postgres -d inventory -c "
SELECT
    (SELECT COUNT(*) FROM \"Component\") as components,
    (SELECT COUNT(*) FROM \"SKU\") as skus,
    (SELECT COUNT(*) FROM \"Transaction\") as transactions;
"
```

### 5. Investigate cause
- Review agent outputs in `.agents/outputs/`
- Check which commands were run
- Update agent safety protocols if needed

---

## Protection Scripts

| Script | Purpose | When Run |
|--------|---------|----------|
| `scripts/backup-production.sh` | Create backup, record counts | Pre-workflow |
| `scripts/reseed-test-database.sh` | Restore test from backup | Pre-workflow |
| `scripts/verify-production-integrity.sh` | Verify counts unchanged | Post-workflow |
| `scripts/setup-database-roles.sh` | Create RBAC roles | Initial setup |

---

## Verification Checklist

Before running orchestrate3:

- [ ] Production container running (`docker ps | grep inventory-db-prod`)
- [ ] Test container running (`docker ps | grep inventory-db-test`)
- [ ] Recent backup exists in `.backups/`
- [ ] Test database has tables (not freshly wiped)

After orchestrate3:

- [ ] Production counts unchanged
- [ ] Test database reflects changes from agents
- [ ] Backup rotation maintained (max 5)
- [ ] Commit and push successful
