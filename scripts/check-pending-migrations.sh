#!/bin/bash
# check-pending-migrations.sh
# Checks if there are pending migrations that need to be applied to production
# Returns exit code 0 if no pending migrations, 1 if migrations pending
# Usage: ./scripts/check-pending-migrations.sh [--verbose]

set -e

VERBOSE=false
if [[ "$1" == "--verbose" ]]; then
    VERBOSE=true
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PROJECT_ROOT="/home/pbrown/SkuInventory"
cd "$PROJECT_ROOT"

# Production database connection
PROD_DB_URL="postgresql://postgres:AIcodingi_FuN@172.16.20.50:4546/inventory?schema=public"

# Get migration status from Prisma
MIGRATE_STATUS=$(DATABASE_URL="$PROD_DB_URL" npx prisma migrate status 2>&1)

# Check if database is up to date
if echo "$MIGRATE_STATUS" | grep -q "Database schema is up to date"; then
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "${GREEN}No pending migrations${NC}"
        echo "All migrations have been applied to production."
    fi
    echo "PENDING_MIGRATIONS=0"
    exit 0
fi

# Check for pending migrations in the output
# Prisma shows "Following migration(s) have not yet been applied:" when pending
if echo "$MIGRATE_STATUS" | grep -q "not yet been applied"; then
    # Extract pending migration names
    PENDING_MIGRATIONS=$(echo "$MIGRATE_STATUS" | grep -A 100 "not yet been applied" | grep -E '^\s+[0-9]+' | sed 's/^[[:space:]]*//')
    PENDING_COUNT=$(echo "$PENDING_MIGRATIONS" | grep -c . || echo "0")

    echo -e "${YELLOW}================================================================${NC}"
    echo -e "${YELLOW}       PENDING MIGRATIONS DETECTED${NC}"
    echo -e "${YELLOW}================================================================${NC}"
    echo ""
    echo -e "${RED}$PENDING_COUNT migration(s) need to be applied to production:${NC}"
    echo ""

    echo "$PENDING_MIGRATIONS" | while read migration; do
        echo "  - $migration"
        if [[ "$VERBOSE" == "true" && -f "prisma/migrations/$migration/migration.sql" ]]; then
            echo "    SQL preview:"
            head -20 "prisma/migrations/$migration/migration.sql" | sed 's/^/      /'
            echo "      ..."
        fi
    done

    echo ""
    echo -e "${YELLOW}Before applying to production:${NC}"
    echo "  1. Verify backup exists in .backups/"
    echo "  2. Review migration SQL: prisma/migrations/[name]/migration.sql"
    echo "  3. Apply manually:"
    echo "     DATABASE_URL=\"$PROD_DB_URL\" npx prisma migrate deploy"
    echo ""
    echo "PENDING_MIGRATIONS=$PENDING_COUNT"

    exit 1
else
    # No "up to date" and no "not yet applied" - might be an error
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "${GREEN}No pending migrations detected${NC}"
        echo "$MIGRATE_STATUS"
    fi
    echo "PENDING_MIGRATIONS=0"
    exit 0
fi
