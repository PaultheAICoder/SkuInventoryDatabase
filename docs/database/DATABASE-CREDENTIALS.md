# Database Credentials and Access Control

**Last Updated**: 2025-12-04
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

## Test Database (Port 2346)

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
PGPASSWORD=inventory_test_2025 psql -h localhost -p 2346 -U inventory_test -d inventory_test
```

### From Docker Containers

```bash
# Production admin (for migrations)
docker exec inventory-db-prod psql -U inventory_admin -d inventory

# Test (for agent workflows)
docker exec inventory-db-test psql -U inventory_test -d inventory_test
```

### Prisma Commands

```bash
# Production migrations (use admin role)
DATABASE_URL="postgresql://inventory_admin:inventory_admin_2025_secure@localhost:4546/inventory" npx prisma migrate deploy

# Test environment (agents use this)
DATABASE_URL="postgresql://inventory_test:inventory_test_2025@localhost:2346/inventory_test" npx prisma migrate deploy
```

---

## Environment Variables

### .env (Production)
```bash
DATABASE_URL=postgresql://inventory_app:inventory_app_2025@localhost:4546/inventory
```

### .env.test (Test)
```bash
DATABASE_URL=postgresql://inventory_test:inventory_test_2025@localhost:2346/inventory_test
```

---

## Troubleshooting

### "Permission denied for table X"
- Check which role you're using
- Production `inventory_app` cannot DELETE - use `inventory_admin` if needed

### "Role does not exist"
Run: `./scripts/setup-database-roles.sh`

### "Connection refused"
- Check if container is running: `docker ps | grep inventory-db`
- Check port mapping: production=4546, test=2346

---

## Security Notes

- Credentials in this file are for local development
- Production deployment should use secrets management
- Rotate passwords after any suspected exposure
- Test credentials are intentionally simple (disposable environment)
