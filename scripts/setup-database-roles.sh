#!/bin/bash
# scripts/setup-database-roles.sh
# Creates role-based access control for production database protection
#
# USAGE:
#   ./scripts/setup-database-roles.sh
#
# This script sets up database roles for production environment:
#   - inventory_admin: Superuser for migrations/restores only
#   - inventory_app: Read/Write for app (NO DELETE on production)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}Database Role Setup - Trevor Inventory${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""

# Check if production container is running
if ! docker ps | grep -q inventory-db-prod; then
    echo -e "${RED}ERROR: Production database container not running${NC}"
    echo "  Start with: cd docker && docker compose -f docker-compose.prod.yml up -d db"
    exit 1
fi

echo "Setting up production database roles on port 4546..."
echo ""

# Production database roles
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
EOSQL

echo ""
echo -e "${GREEN}Production database roles configured${NC}"
echo ""
echo "Roles created:"
echo "  - inventory_admin (superuser - for migrations/restores)"
echo "  - inventory_app (read/write - NO DELETE)"
echo ""
echo "Credentials (local development only):"
echo "  - inventory_admin: inventory_admin_2025_secure"
echo "  - inventory_app: inventory_app_2025"
echo ""
echo -e "${YELLOW}NOTE: These credentials are for local development.${NC}"
echo -e "${YELLOW}Use secrets management for production deployment.${NC}"
echo ""
