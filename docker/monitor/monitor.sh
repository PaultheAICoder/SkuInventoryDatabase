#!/bin/sh
# Docker Container Health Monitor Script
# Polls container health and sends data to webhook endpoint

set -e

# Configuration from environment
WEBHOOK_URL="${WEBHOOK_URL:-http://localhost:4500/api/webhooks/docker-health}"
WEBHOOK_SECRET="${WEBHOOK_SECRET:-}"
POLL_INTERVAL="${POLL_INTERVAL:-30}"
CONTAINERS="${CONTAINERS_TO_MONITOR:-}"

# Install required packages
apk add --no-cache curl jq docker-cli >/dev/null 2>&1

log() {
    echo "[$(date -Iseconds)] $1"
}

send_webhook() {
    local data="$1"

    if [ -z "$WEBHOOK_SECRET" ]; then
        log "ERROR: WEBHOOK_SECRET not configured"
        return 1
    fi

    curl -s -X POST "$WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $WEBHOOK_SECRET" \
        -d "$data" || log "ERROR: Failed to send webhook"
}

get_container_health() {
    local container="$1"

    # Get container inspect data
    local inspect=$(docker inspect "$container" 2>/dev/null || echo "{}")

    if [ "$inspect" = "{}" ] || [ "$inspect" = "[]" ]; then
        echo "unknown"
        return
    fi

    # Extract health status
    local health=$(echo "$inspect" | jq -r '.[0].State.Health.Status // "none"')
    local running=$(echo "$inspect" | jq -r '.[0].State.Running')

    if [ "$running" = "false" ]; then
        echo "unhealthy"
    elif [ "$health" = "healthy" ] || [ "$health" = "none" ] && [ "$running" = "true" ]; then
        echo "healthy"
    else
        echo "$health"
    fi
}

get_container_stats() {
    local container="$1"

    # Get container stats (one-shot)
    local stats=$(docker stats "$container" --no-stream --format '{{json .}}' 2>/dev/null || echo "{}")

    if [ "$stats" = "{}" ]; then
        echo '{"cpuPercent": null, "memoryUsageMb": null, "memoryLimitMb": null}'
        return
    fi

    # Parse CPU and memory
    local cpu=$(echo "$stats" | jq -r '.CPUPerc' | tr -d '%')
    local mem_usage=$(echo "$stats" | jq -r '.MemUsage' | awk -F'/' '{print $1}' | tr -d ' MiB')
    local mem_limit=$(echo "$stats" | jq -r '.MemUsage' | awk -F'/' '{print $2}' | tr -d ' MiB')

    echo "{\"cpuPercent\": ${cpu:-null}, \"memoryUsageMb\": ${mem_usage:-null}, \"memoryLimitMb\": ${mem_limit:-null}}"
}

check_container() {
    local container="$1"

    local status=$(get_container_health "$container")
    local stats=$(get_container_stats "$container")
    local container_id=$(docker inspect "$container" --format '{{.Id}}' 2>/dev/null | cut -c1-12 || echo "")

    local cpu=$(echo "$stats" | jq -r '.cpuPercent')
    local mem_usage=$(echo "$stats" | jq -r '.memoryUsageMb')
    local mem_limit=$(echo "$stats" | jq -r '.memoryLimitMb')

    # Send health log
    local data=$(cat <<EOF
{
    "type": "health_log",
    "containerName": "$container",
    "containerId": "$container_id",
    "status": "$status",
    "cpuPercent": $cpu,
    "memoryUsageMb": $mem_usage,
    "memoryLimitMb": $mem_limit
}
EOF
)

    send_webhook "$data"

    # Check for unhealthy status and send alert
    if [ "$status" = "unhealthy" ]; then
        log "ALERT: Container $container is unhealthy"

        # Get logs for alert
        local logs=$(docker logs "$container" --tail 50 2>&1 | tail -20 || echo "Unable to fetch logs")

        local alert_data=$(cat <<EOF
{
    "type": "alert",
    "containerName": "$container",
    "containerId": "$container_id",
    "status": "unhealthy",
    "eventType": "health_status",
    "errorMessage": "Container health check failed",
    "timestamp": "$(date -Iseconds)"
}
EOF
)
        send_webhook "$alert_data"
    fi
}

main() {
    log "Starting Docker Health Monitor"
    log "Monitoring containers: $CONTAINERS"
    log "Poll interval: ${POLL_INTERVAL}s"

    # Wait for app to be ready
    sleep 10

    while true; do
        # Split containers by comma and check each
        echo "$CONTAINERS" | tr ',' '\n' | while read container; do
            if [ -n "$container" ]; then
                check_container "$container"
            fi
        done

        sleep "$POLL_INTERVAL"
    done
}

main
