#!/bin/sh
# Amazon Sync Cron Trigger Script
# Called by systemd timer or crontab at 5 AM daily

set -e

# Configuration from environment
APP_URL="${APP_URL:-http://172.16.20.50:4545}"
CRON_SECRET="${CRON_SECRET:-}"
LOG_FILE="${LOG_FILE:-/var/log/inventory/amazon-sync.log}"

log() {
    echo "[$(date -Iseconds)] $1" | tee -a "$LOG_FILE"
}

if [ -z "$CRON_SECRET" ]; then
    log "ERROR: CRON_SECRET not configured"
    exit 1
fi

log "Starting Amazon sync..."

# Make the request
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$APP_URL/api/cron/ads-sync" \
    -H "X-Cron-Secret: $CRON_SECRET" \
    -H "Content-Type: application/json" \
    --max-time 660)

# Extract HTTP code (last line) and body (everything else)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

log "HTTP Response: $HTTP_CODE"
log "Response: $BODY"

if [ "$HTTP_CODE" -eq 200 ]; then
    log "Amazon sync completed successfully"
    exit 0
else
    log "ERROR: Amazon sync failed with HTTP $HTTP_CODE"
    exit 1
fi
