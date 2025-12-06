# Database Operations Runbook

**Purpose**: Common database operations for Trevor Inventory project

---

## Quick Reference

| Environment | Web | Database | Container |
|-------------|-----|----------|-----------|
| Production | http://172.16.20.50:4545 | localhost:4546 | inventory-db-prod |
| Test | http://172.16.20.50:2345 | localhost:2346 | inventory-db-test |

---

## Starting Environments

### Start Production
```bash
cd /home/pbrown/SkuInventory/docker
docker compose -f docker-compose.prod.yml up -d
```

### Start Test
```bash
cd /home/pbrown/SkuInventory/docker
docker compose -f docker-compose.test.yml up -d
```

### Verify Running
```bash
docker ps | grep inventory
# Should show: inventory-app-prod, inventory-db-prod
#              inventory-app-test, inventory-db-test
```

---

## Backup Operations

### Create Production Backup
```bash
cd /home/pbrown/SkuInventory
./scripts/backup-production.sh

# With issue number (for orchestrate3)
./scripts/backup-production.sh 123
```

### List Backups
```bash
ls -la .backups/
```

### Manual Restore to Test
```bash
# Find backup file
BACKUP_FILE=$(ls -t .backups/inventory_backup_*.dump | head -1)

# Restore
./scripts/reseed-test-database.sh "$BACKUP_FILE" --force
```

---

## Test Database Operations

### Reseed from Latest Backup
```bash
./scripts/reseed-test-database.sh --force
```

### Fresh Start (Empty Database OK)
```bash
./scripts/reseed-test-database.sh --force --fresh-start
```

### Check Test Database Status
```bash
docker exec inventory-db-test psql -U inventory_test -d inventory_test -c "
SELECT
    (SELECT COUNT(*) FROM \"Component\") as components,
    (SELECT COUNT(*) FROM \"SKU\") as skus,
    (SELECT COUNT(*) FROM \"Transaction\") as transactions;
"
```

### Connect to Test Database
```bash
docker exec -it inventory-db-test psql -U inventory_test -d inventory_test
```

---

## Production Verification

### Check Production Counts
```bash
docker exec inventory-db-prod psql -U postgres -d inventory -c "
SELECT
    (SELECT COUNT(*) FROM \"Component\") as components,
    (SELECT COUNT(*) FROM \"SKU\") as skus,
    (SELECT COUNT(*) FROM \"Transaction\") as transactions;
"
```

### Verify Integrity (After Workflow)
```bash
./scripts/verify-production-integrity.sh 150 50 1000
# Args: expected_components expected_skus expected_transactions
```

---

## Prisma Operations

### Run Migrations (Test)
```bash
cd /home/pbrown/SkuInventory
DATABASE_URL="postgresql://inventory_test:inventory_test_2025@localhost:2346/inventory_test" \
    npx prisma migrate deploy
```

### Run Migrations (Production)
```bash
cd /home/pbrown/SkuInventory
DATABASE_URL="postgresql://inventory_admin:inventory_admin_2025_secure@localhost:4546/inventory" \
    npx prisma migrate deploy
```

### Generate Client
```bash
npx prisma generate
```

### View Schema
```bash
cat prisma/schema.prisma
```

---

## Docker Operations

### View Logs
```bash
# Production app
docker logs inventory-app-prod -f

# Test database
docker logs inventory-db-test -f
```

### Restart Containers
```bash
# Production
cd /home/pbrown/SkuInventory/docker
docker compose -f docker-compose.prod.yml restart

# Test
docker compose -f docker-compose.test.yml restart
```

### Full Rebuild
```bash
# Stop and remove
docker compose -f docker-compose.prod.yml down

# Rebuild and start
docker compose -f docker-compose.prod.yml up -d --build
```

---

## Running Tests

### Unit Tests
```bash
cd /home/pbrown/SkuInventory
npm test
```

### E2E Tests (Against Test Environment)
```bash
TEST_BASE_URL=http://172.16.20.50:2345 npm run test:e2e
```

### Type Check
```bash
npx tsc --noEmit
```

### Lint
```bash
npm run lint
```

---

## Troubleshooting

### Container Won't Start
```bash
# Check logs
docker logs inventory-db-test 2>&1 | tail -20

# Check port conflicts
lsof -i :2346
lsof -i :4546
```

### Database Connection Refused
```bash
# Verify container is running
docker ps | grep inventory-db

# Check container health
docker inspect inventory-db-test --format='{{.State.Health.Status}}'
```

### Permission Denied Errors
```bash
# Check current role
docker exec inventory-db-test psql -U inventory_test -d inventory_test -c "SELECT current_user;"

# For production, may need admin role
docker exec inventory-db-prod psql -U inventory_admin -d inventory
```

### Prisma Schema Out of Sync
```bash
# Check migration status
DATABASE_URL="postgresql://inventory_test:inventory_test_2025@localhost:2346/inventory_test" \
    npx prisma migrate status

# Apply pending migrations
DATABASE_URL="postgresql://inventory_test:inventory_test_2025@localhost:2346/inventory_test" \
    npx prisma migrate deploy
```

---

## Emergency Procedures

### Production Data Corruption
1. **STOP** - Do not commit/push
2. List backups: `ls -la .backups/`
3. Restore: See PROTECTION-STRATEGY.md for steps
4. Verify counts match expected values

### Test Database Catastrophic Failure (Exit 99)
1. Check if intentional (first setup?)
2. If yes: Use `--fresh-start` flag
3. If no: Investigate container volumes

### orchestrate3 Halted Mid-Workflow
1. Check agent output files in `.agents/outputs/`
2. Verify production unchanged
3. Fix issue before re-running
