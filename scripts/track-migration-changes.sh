#!/bin/bash
# track-migration-changes.sh
# Tracks migration changes during an orchestrate3 workflow
# Usage:
#   ./scripts/track-migration-changes.sh snapshot <issue_number>  - Save current state
#   ./scripts/track-migration-changes.sh check <issue_number>     - Check for new migrations
#   ./scripts/track-migration-changes.sh cleanup <issue_number>   - Remove tracking files

set -e

ACTION="${1:-check}"
ISSUE_NUMBER="${2:-unknown}"

PROJECT_ROOT="/home/pbrown/SkuInventory"
TRACKING_DIR="$PROJECT_ROOT/.agents/migration-tracking"
SNAPSHOT_FILE="$TRACKING_DIR/issue-$ISSUE_NUMBER-migrations.txt"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

mkdir -p "$TRACKING_DIR"

case "$ACTION" in
    snapshot)
        # Save current list of migrations before Build agent runs
        ls -1 "$PROJECT_ROOT/prisma/migrations/" 2>/dev/null | grep -E '^[0-9]+' | sort > "$SNAPSHOT_FILE"
        MIGRATION_COUNT=$(wc -l < "$SNAPSHOT_FILE")
        echo -e "${CYAN}Migration snapshot saved for issue #$ISSUE_NUMBER${NC}"
        echo "  Migrations at start: $MIGRATION_COUNT"
        echo "SNAPSHOT_FILE=$SNAPSHOT_FILE"
        echo "MIGRATION_COUNT=$MIGRATION_COUNT"
        ;;

    check)
        if [[ ! -f "$SNAPSHOT_FILE" ]]; then
            echo -e "${YELLOW}Warning: No snapshot found for issue #$ISSUE_NUMBER${NC}"
            echo "Run 'snapshot' action first before Build agent."
            exit 0
        fi

        # Get current migrations
        CURRENT_MIGRATIONS=$(ls -1 "$PROJECT_ROOT/prisma/migrations/" 2>/dev/null | grep -E '^[0-9]+' | sort)

        # Compare with snapshot
        NEW_MIGRATIONS=""
        while IFS= read -r migration; do
            if ! grep -q "^$migration$" "$SNAPSHOT_FILE" 2>/dev/null; then
                NEW_MIGRATIONS="$NEW_MIGRATIONS$migration\n"
            fi
        done <<< "$CURRENT_MIGRATIONS"

        # Remove trailing newline
        NEW_MIGRATIONS=$(echo -e "$NEW_MIGRATIONS" | sed '/^$/d')

        if [[ -z "$NEW_MIGRATIONS" ]]; then
            echo -e "${GREEN}No new migrations created during this workflow${NC}"
            echo "NEW_MIGRATIONS=0"
            exit 0
        else
            NEW_COUNT=$(echo -e "$NEW_MIGRATIONS" | wc -l)

            echo ""
            echo -e "${RED}================================================================${NC}"
            echo -e "${RED}  MIGRATION CREATED - MANUAL REVIEW REQUIRED${NC}"
            echo -e "${RED}================================================================${NC}"
            echo ""
            echo -e "${YELLOW}$NEW_COUNT new migration(s) created during issue #$ISSUE_NUMBER:${NC}"
            echo ""

            echo -e "$NEW_MIGRATIONS" | while read migration; do
                echo -e "  ${CYAN}$migration${NC}"
                MIGRATION_SQL="$PROJECT_ROOT/prisma/migrations/$migration/migration.sql"
                if [[ -f "$MIGRATION_SQL" ]]; then
                    echo ""
                    echo "  Migration SQL:"
                    echo "  --------------"
                    cat "$MIGRATION_SQL" | head -50 | sed 's/^/    /'
                    LINE_COUNT=$(wc -l < "$MIGRATION_SQL")
                    if [[ $LINE_COUNT -gt 50 ]]; then
                        echo "    ... ($((LINE_COUNT - 50)) more lines)"
                    fi
                    echo ""
                fi
            done

            echo ""
            echo -e "${YELLOW}================================================================${NC}"
            echo -e "${YELLOW}  ACTION REQUIRED BEFORE CONTINUING${NC}"
            echo -e "${YELLOW}================================================================${NC}"
            echo ""
            echo "  1. Review the migration SQL above"
            echo "  2. Verify backup exists:"
            ls -la "$PROJECT_ROOT/.backups/" 2>/dev/null | tail -5 | sed 's/^/     /'
            echo ""
            echo "  3. Apply migration to production manually:"
            echo ""
            echo -e "     ${CYAN}cd $PROJECT_ROOT${NC}"
            echo -e "     ${CYAN}DATABASE_URL=\"postgresql://postgres:AIcodingi_FuN@172.16.20.50:4546/inventory?schema=public\" npx prisma migrate deploy${NC}"
            echo ""
            echo "  4. If migration includes data changes (INSERT/UPDATE), run backfill scripts"
            echo ""
            echo "  5. Verify application works at http://172.16.20.50:4545"
            echo ""
            echo "NEW_MIGRATIONS=$NEW_COUNT"
            echo "MIGRATION_NAMES=$(echo -e "$NEW_MIGRATIONS" | tr '\n' ',' | sed 's/,$//')"

            exit 2  # Exit code 2 = migrations require manual review
        fi
        ;;

    cleanup)
        if [[ -f "$SNAPSHOT_FILE" ]]; then
            rm "$SNAPSHOT_FILE"
            echo "Cleaned up tracking file for issue #$ISSUE_NUMBER"
        fi
        ;;

    *)
        echo "Usage: $0 {snapshot|check|cleanup} <issue_number>"
        echo ""
        echo "Actions:"
        echo "  snapshot  - Save current migration state before Build agent"
        echo "  check     - Check for new migrations after Build agent"
        echo "  cleanup   - Remove tracking files"
        exit 1
        ;;
esac
