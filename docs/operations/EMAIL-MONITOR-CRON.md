# Email Monitor Cron Job

## Overview

The email monitor cron job polls the feedback email inbox every 5 minutes to check for replies to issue resolution notifications. It processes user responses to determine if they verified a fix or requested additional changes.

## Quick Start

### Installation

```bash
cd /home/pbrown/SkuInventory/scripts/systemd
sudo ./install-email-monitor-cron.sh
```

### Uninstallation

```bash
cd /home/pbrown/SkuInventory/scripts/systemd
sudo ./uninstall-email-monitor-cron.sh
```

## Architecture

### Components

1. **Systemd Timer**: `/etc/systemd/system/inventory-email-monitor.timer`
   - Triggers every 5 minutes
   - Survives reboots (Persistent=true)
   - Starts 1 minute after boot

2. **Systemd Service**: `/etc/systemd/system/inventory-email-monitor.service`
   - Executes curl request to the email monitor API
   - Logs output to `/var/log/inventory/email-monitor.log`
   - Saves last response to `/var/log/inventory/email-monitor-last.json`

3. **API Endpoint**: `GET /api/cron/email-monitor`
   - Protected by CRON_SECRET bearer token
   - Polls email inbox via Microsoft Graph API
   - Updates Feedback database records

### Flow Diagram

```
systemd timer (5 min)
       |
       v
systemd service (curl)
       |
       v
/api/cron/email-monitor
       |
       v
Microsoft Graph API (poll inbox)
       |
       v
Feedback table (update records)
```

## Configuration

### CRON_SECRET

The secret is stored in:
- `/home/pbrown/SkuInventory/docker/.env` (used by Docker)
- `/etc/systemd/system/inventory-email-monitor.service` (used by systemd)

**IMPORTANT**: If you regenerate the CRON_SECRET, update BOTH locations.

### Changing the Poll Interval

Edit `/etc/systemd/system/inventory-email-monitor.timer`:

```ini
[Timer]
OnUnitActiveSec=5min  # Change this value
```

Then reload:

```bash
sudo systemctl daemon-reload
sudo systemctl restart inventory-email-monitor.timer
```

### Environment Variables

| Variable | Location | Description |
|----------|----------|-------------|
| `CRON_SECRET` | systemd service | Bearer token for API authentication |
| `CRON_SECRET` | docker/.env | Same token (must match) |

## Operations

### Check Timer Status

```bash
# View timer status
sudo systemctl status inventory-email-monitor.timer

# List all timers with next run time
sudo systemctl list-timers | grep inventory
```

### Check Service Status

```bash
# View last execution status
sudo systemctl status inventory-email-monitor.service

# View logs
cat /var/log/inventory/email-monitor.log
tail -f /var/log/inventory/email-monitor.log  # Live follow

# View last response
cat /var/log/inventory/email-monitor-last.json | jq .
```

### Manual Trigger

```bash
# Run immediately via systemd
sudo systemctl start inventory-email-monitor.service

# Or use curl directly
curl -X GET "http://172.16.20.50:4545/api/cron/email-monitor" \
  -H "Authorization: Bearer $(grep CRON_SECRET /home/pbrown/SkuInventory/docker/.env | cut -d= -f2)"
```

### Stop/Disable

```bash
# Stop timer (until next reboot)
sudo systemctl stop inventory-email-monitor.timer

# Disable timer (survives reboot)
sudo systemctl disable inventory-email-monitor.timer
```

### Restart After Changes

```bash
sudo systemctl daemon-reload
sudo systemctl restart inventory-email-monitor.timer
```

## Troubleshooting

### Timer Not Running

```bash
# Check if timer is enabled
sudo systemctl is-enabled inventory-email-monitor.timer

# Check for errors
sudo journalctl -u inventory-email-monitor.timer -n 50

# Verify service file syntax
sudo systemd-analyze verify inventory-email-monitor.service
```

### Service Failing

```bash
# Check service status and exit code
sudo systemctl status inventory-email-monitor.service

# Check full logs
sudo journalctl -u inventory-email-monitor.service -n 100

# Check network connectivity
curl -v "http://172.16.20.50:4545/api/health"
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| 401 Unauthorized | CRON_SECRET mismatch | Verify secret in service matches docker/.env |
| Connection refused | App not running | Check `docker ps \| grep inventory-app` |
| Timeout | Network/App slow | Check app health, increase TimeoutSec |
| Empty log | Service not triggered | Check `systemctl list-timers` for next trigger |

### Debugging Steps

1. **Verify the endpoint works manually**:
   ```bash
   curl -s -w "\nHTTP_CODE:%{http_code}\n" \
     -H "Authorization: Bearer tHhCDDrFWf+5WREIQsSYp75++qjjd0V26qetRtcQvp8=" \
     "http://172.16.20.50:4545/api/cron/email-monitor"
   ```

2. **Check systemd journal**:
   ```bash
   sudo journalctl -u inventory-email-monitor.service --since "1 hour ago"
   ```

3. **Verify Docker app is running**:
   ```bash
   docker ps | grep inventory-app
   curl http://172.16.20.50:4545/api/health
   ```

## Log Files

| File | Description |
|------|-------------|
| `/var/log/inventory/email-monitor.log` | All execution logs |
| `/var/log/inventory/email-monitor-last.json` | Most recent API response |
| `journalctl -u inventory-email-monitor.service` | Systemd service logs |
| `journalctl -u inventory-email-monitor.timer` | Timer trigger logs |

### Log Rotation

Logs are rotated daily with 7 days retention:
- Configuration: `/etc/logrotate.d/inventory-email-monitor`
- Rotation: Daily
- Retention: 7 days
- Compression: gzip (delayed)

## Security Considerations

1. **CRON_SECRET** is stored in plaintext in the systemd service file
   - This is acceptable for a private server
   - Alternative: Use systemd credentials or environment file with restricted permissions

2. **Log files** may contain sensitive information
   - Log rotation is configured to limit exposure
   - Consider `/var/log/inventory/` permissions if multi-user

3. **Service runs as root**
   - Only performs HTTP requests
   - Consider creating dedicated user for additional isolation

## File Locations

### Source Files (Project)

```
/home/pbrown/SkuInventory/scripts/systemd/
  - inventory-email-monitor.service     # systemd service file
  - inventory-email-monitor.timer       # systemd timer file
  - inventory-email-monitor.logrotate   # logrotate config
  - install-email-monitor-cron.sh       # installation script
  - uninstall-email-monitor-cron.sh     # uninstallation script
```

### Installed Files (System)

```
/etc/systemd/system/
  - inventory-email-monitor.service
  - inventory-email-monitor.timer

/etc/logrotate.d/
  - inventory-email-monitor

/var/log/inventory/
  - email-monitor.log
  - email-monitor-last.json
```

## API Response Format

The email monitor endpoint returns JSON with the following structure:

```json
{
  "status": "success",
  "emailsChecked": 10,
  "processed": 2,
  "verified": 1,
  "changesRequested": 1,
  "skipped": 8,
  "skippedReasons": [
    { "reason": "no matching feedback record", "count": 5 },
    { "reason": "already processed", "count": 3 }
  ],
  "errors": [],
  "lastCheckTimeUpdated": true,
  "timestamp": "2025-12-09T21:45:00.000Z",
  "checkWindow": {
    "from": "2025-12-09T21:40:00.000Z",
    "to": "2025-12-09T21:45:00.000Z"
  }
}
```

## Related Documentation

- **Feedback System Overview**: See GitHub issues #235-#238
- **Email Configuration**: Azure AD app registration for Microsoft Graph API
- **Webhook Integration**: `/api/webhooks/github` creates Feedback records
- **Database Schema**: `Feedback` and `EmailMonitorState` models in Prisma
