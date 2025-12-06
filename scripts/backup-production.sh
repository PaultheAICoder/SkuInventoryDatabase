#!/bin/bash
# scripts/backup-production.sh
# Creates backup of production database with max 5 rotation
#
# USAGE:
#   ./scripts/backup-production.sh           # Creates timestamped backup
#   ./scripts/backup-production.sh <issue>   # Creates backup tagged with issue number
#
# OUTPUT:
#   Creates backup file in .backups/ directory
#   Prints key-value pairs for script consumption:
#     BACKUP_FILE=/path/to/backup.dump
#     COMPONENT_COUNT=123
#     SKU_COUNT=456
#     TRANSACTION_COUNT=789

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_ROOT/.backups"

# Get issue tag if provided
ISSUE_TAG="${1:-$(date +%s)}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/inventory_backup_${ISSUE_TAG}_${TIMESTAMP}.dump"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}           Production Database Backup${NC}"
echo -e "${GREEN}================================================================${NC}"
echo ""

# Create backup directory if needed
mkdir -p "$BACKUP_DIR"

# BACKUP ROTATION: Keep maximum of 5 backups
echo "Checking backup rotation (max 5 backups)..."
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "inventory_backup_*.dump" -type f -size +0 2>/dev/null | wc -l | xargs)
echo "  Current backups: $BACKUP_COUNT"

if [ "$BACKUP_COUNT" -ge 5 ]; then
    DELETE_COUNT=$((BACKUP_COUNT - 4))
    echo -e "  ${YELLOW}Deleting $DELETE_COUNT oldest backup(s)...${NC}"

    find "$BACKUP_DIR" -name "inventory_backup_*.dump" -type f -size +0 -print0 2>/dev/null | \
        xargs -0 ls -t 2>/dev/null | \
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

# Create backup using custom format (-Fc) for better compression and pg_restore compatibility
echo "Creating backup: $(basename "$BACKUP_FILE")"
docker exec inventory-db-prod pg_dump -U postgres -d inventory -Fc > "$BACKUP_FILE"

# Verify backup created
if [ ! -f "$BACKUP_FILE" ] || [ ! -s "$BACKUP_FILE" ]; then
    echo -e "${RED}ERROR: Backup file not created or empty${NC}"
    exit 1
fi

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

echo ""
echo -e "${GREEN}Backup complete${NC}"
echo "  File: $(basename "$BACKUP_FILE")"
echo "  Size: $SIZE"
echo "  Components: $COMPONENT_COUNT"
echo "  SKUs: $SKU_COUNT"
echo "  Transactions: $TRANSACTION_COUNT"
echo ""

# Output for script consumption (parseable key-value pairs)
echo "BACKUP_FILE=$BACKUP_FILE"
echo "COMPONENT_COUNT=$COMPONENT_COUNT"
echo "SKU_COUNT=$SKU_COUNT"
echo "TRANSACTION_COUNT=$TRANSACTION_COUNT"
