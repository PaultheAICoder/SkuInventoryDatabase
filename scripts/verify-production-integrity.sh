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
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "================================================================"
echo "Production Database Integrity Verification"
echo "================================================================"
echo ""

# Verify production container is running
if ! docker ps | grep -q inventory-db-prod; then
    echo -e "${RED}ERROR: Production database container not running${NC}"
    exit 1
fi

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
elif [ "$ACTUAL_TRANSACTIONS" != "$EXPECTED_TRANSACTIONS" ]; then
    echo -e "${YELLOW}NOTE: Transaction count increased ($EXPECTED_TRANSACTIONS -> $ACTUAL_TRANSACTIONS)${NC}"
    echo "  This is expected if users were active during the cycle."
fi

if [ "$ERRORS" -gt 0 ]; then
    echo ""
    echo -e "${RED}================================================================${NC}"
    echo -e "${RED}INTEGRITY CHECK FAILED${NC}"
    echo -e "${RED}================================================================${NC}"
    echo ""
    echo "PRODUCTION DATABASE MAY HAVE BEEN MODIFIED!"
    echo "DO NOT commit or push until this is investigated."
    echo ""
    exit 1
fi

echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}Production database integrity verified${NC}"
echo -e "${GREEN}================================================================${NC}"
echo ""
echo "Database unchanged during orchestrate3 cycle"
echo ""
exit 0
