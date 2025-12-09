#!/bin/bash
#
# Install Email Monitor Cron Job
# This script sets up the systemd timer for the email monitor
#
# Usage: sudo ./install-email-monitor-cron.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

echo_info "Installing Email Monitor Cron Job..."

# Step 1: Create log directory
echo_info "Creating log directory /var/log/inventory/"
mkdir -p /var/log/inventory
chmod 755 /var/log/inventory
chown root:adm /var/log/inventory
echo_info "Log directory created successfully"

# Step 2: Install systemd service
echo_info "Installing systemd service file..."
cp "$SCRIPT_DIR/inventory-email-monitor.service" /etc/systemd/system/
chmod 644 /etc/systemd/system/inventory-email-monitor.service
echo_info "Service file installed"

# Step 3: Install systemd timer
echo_info "Installing systemd timer file..."
cp "$SCRIPT_DIR/inventory-email-monitor.timer" /etc/systemd/system/
chmod 644 /etc/systemd/system/inventory-email-monitor.timer
echo_info "Timer file installed"

# Step 4: Install logrotate configuration
echo_info "Installing logrotate configuration..."
cp "$SCRIPT_DIR/inventory-email-monitor.logrotate" /etc/logrotate.d/inventory-email-monitor
chmod 644 /etc/logrotate.d/inventory-email-monitor
echo_info "Logrotate configuration installed"

# Step 5: Reload systemd
echo_info "Reloading systemd daemon..."
systemctl daemon-reload
echo_info "Systemd daemon reloaded"

# Step 6: Enable and start timer
echo_info "Enabling timer to start on boot..."
systemctl enable inventory-email-monitor.timer
echo_info "Starting timer..."
systemctl start inventory-email-monitor.timer
echo_info "Timer started"

# Step 7: Verify installation
echo ""
echo_info "=== Verification ==="
echo ""

# Check timer status
echo_info "Timer status:"
systemctl is-enabled inventory-email-monitor.timer && echo "  Timer is enabled"
systemctl is-active inventory-email-monitor.timer && echo "  Timer is active"

# Show next execution
echo ""
echo_info "Next scheduled execution:"
systemctl list-timers inventory-email-monitor.timer --no-pager

# Step 8: Run initial test
echo ""
echo_info "Running initial test execution..."
systemctl start inventory-email-monitor.service

# Check result
sleep 2
if systemctl is-active --quiet inventory-email-monitor.service; then
    echo_warn "Service is still running (may take a moment)"
else
    EXIT_CODE=$(systemctl show -p ExecMainStatus inventory-email-monitor.service --value)
    if [[ "$EXIT_CODE" == "0" ]]; then
        echo_info "Test execution completed successfully (exit code 0)"
    else
        echo_error "Test execution failed with exit code: $EXIT_CODE"
        echo_warn "Check logs: cat /var/log/inventory/email-monitor.log"
    fi
fi

# Show last response if available
if [[ -f /var/log/inventory/email-monitor-last.json ]]; then
    echo ""
    echo_info "Last API response:"
    cat /var/log/inventory/email-monitor-last.json
fi

echo ""
echo_info "=== Installation Complete ==="
echo ""
echo "Commands:"
echo "  Check timer:    sudo systemctl status inventory-email-monitor.timer"
echo "  Check service:  sudo systemctl status inventory-email-monitor.service"
echo "  View logs:      cat /var/log/inventory/email-monitor.log"
echo "  Manual trigger: sudo systemctl start inventory-email-monitor.service"
echo ""
