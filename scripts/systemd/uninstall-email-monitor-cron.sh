#!/bin/bash
#
# Uninstall Email Monitor Cron Job
# This script removes the systemd timer for the email monitor
#
# Usage: sudo ./uninstall-email-monitor-cron.sh
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
echo_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
echo_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo_error "This script must be run as root (use sudo)"
   exit 1
fi

echo_info "Uninstalling Email Monitor Cron Job..."

# Step 1: Stop and disable timer
echo_info "Stopping timer..."
systemctl stop inventory-email-monitor.timer 2>/dev/null || echo_warn "Timer was not running"

echo_info "Disabling timer..."
systemctl disable inventory-email-monitor.timer 2>/dev/null || echo_warn "Timer was not enabled"

# Step 2: Remove systemd files
echo_info "Removing systemd files..."
rm -f /etc/systemd/system/inventory-email-monitor.service
rm -f /etc/systemd/system/inventory-email-monitor.timer
echo_info "Systemd files removed"

# Step 3: Reload systemd
echo_info "Reloading systemd daemon..."
systemctl daemon-reload
echo_info "Systemd daemon reloaded"

# Step 4: Remove logrotate configuration
echo_info "Removing logrotate configuration..."
rm -f /etc/logrotate.d/inventory-email-monitor
echo_info "Logrotate configuration removed"

# Note: Log directory is NOT removed to preserve historical logs
echo_warn "Log directory /var/log/inventory/ was NOT removed (preserving logs)"
echo_warn "To remove logs: sudo rm -rf /var/log/inventory/"

echo ""
echo_info "=== Uninstallation Complete ==="
echo ""
echo "The email monitor endpoint is still available for manual triggering:"
echo "  curl -X GET 'http://172.16.20.50:4545/api/cron/email-monitor' \\"
echo "    -H 'Authorization: Bearer YOUR_CRON_SECRET'"
echo ""
