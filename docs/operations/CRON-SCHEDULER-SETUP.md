# Cron Scheduler Setup

## Overview

This document describes how to configure external schedulers (cron, systemd timers, or cloud schedulers) to call the inventory application's cron endpoints.

## Cron Endpoints

| Endpoint | Method | Schedule | Purpose |
|----------|--------|----------|---------|
| `/api/cron/alerts` | GET | Every 15 min | Low-stock alert evaluation |
| `/api/cron/email-monitor` | GET | Every 5 min | Poll feedback inbox for replies |
| `/api/cron/ads-sync` | POST | Daily 3:00 AM | Sync Amazon Ads data |
| `/api/cron/retention-cleanup` | POST | Daily 4:00 AM | Delete old records per retention policy |

## Authentication

All cron endpoints require authentication via the `CRON_SECRET` environment variable.

### Header Formats

- **GET endpoints** (alerts, email-monitor): `Authorization: Bearer <CRON_SECRET>`
- **POST endpoints** (ads-sync, retention-cleanup): `X-Cron-Secret: <CRON_SECRET>`

### Setting Up CRON_SECRET

1. Generate a secure secret:
   ```bash
   openssl rand -base64 32
   ```

2. Add to your environment configuration:
   - Docker: `docker/.env`
   - systemd: Service file `Environment=` directive

## Recommended Schedules

| Endpoint | Schedule | Cron Expression | Rationale |
|----------|----------|-----------------|-----------|
| alerts | Every 15 min | `*/15 * * * *` | Frequent checks for low-stock |
| email-monitor | Every 5 min | `*/5 * * * *` | Quick response to feedback |
| ads-sync | Daily 3:00 AM | `0 3 * * *` | Off-peak hours, daily data |
| retention-cleanup | Daily 4:00 AM | `0 4 * * *` | After ads-sync, minimal load |

## systemd Timer Configuration

### Example: Retention Cleanup Timer

Create `/etc/systemd/system/inventory-retention-cleanup.timer`:

```ini
[Unit]
Description=Run Inventory Retention Cleanup daily at 4 AM

[Timer]
OnCalendar=*-*-* 04:00:00
AccuracySec=5min
Persistent=true

[Install]
WantedBy=timers.target
```

Create `/etc/systemd/system/inventory-retention-cleanup.service`:

```ini
[Unit]
Description=Inventory Retention Cleanup - Delete old records
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=oneshot
Environment="CRON_SECRET=your-cron-secret-here"
ExecStart=/usr/bin/curl -s -X POST "http://172.16.20.50:4545/api/cron/retention-cleanup" \
    -H "X-Cron-Secret: ${CRON_SECRET}" \
    -H "Content-Type: application/json" \
    -o /var/log/inventory/retention-cleanup-last.json \
    -w "\nHTTP_CODE:%{http_code}\n"
TimeoutSec=300

StandardOutput=append:/var/log/inventory/retention-cleanup.log
StandardError=append:/var/log/inventory/retention-cleanup.log

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable inventory-retention-cleanup.timer
sudo systemctl start inventory-retention-cleanup.timer
```

### Example: Ads Sync Timer

Create `/etc/systemd/system/inventory-ads-sync.timer`:

```ini
[Unit]
Description=Run Inventory Ads Sync daily at 3 AM

[Timer]
OnCalendar=*-*-* 03:00:00
AccuracySec=5min
Persistent=true

[Install]
WantedBy=timers.target
```

Create `/etc/systemd/system/inventory-ads-sync.service`:

```ini
[Unit]
Description=Inventory Ads Sync - Sync Amazon Ads data
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=oneshot
Environment="CRON_SECRET=your-cron-secret-here"
ExecStart=/usr/bin/curl -s -X POST "http://172.16.20.50:4545/api/cron/ads-sync" \
    -H "X-Cron-Secret: ${CRON_SECRET}" \
    -H "Content-Type: application/json" \
    -o /var/log/inventory/ads-sync-last.json \
    -w "\nHTTP_CODE:%{http_code}\n"
TimeoutSec=600

StandardOutput=append:/var/log/inventory/ads-sync.log
StandardError=append:/var/log/inventory/ads-sync.log

[Install]
WantedBy=multi-user.target
```

## Traditional Crontab

Add to `/etc/crontab` or user crontab:

```bash
# Inventory Cron Jobs
CRON_SECRET=your-cron-secret-here
INVENTORY_URL=http://172.16.20.50:4545

# Low-stock alerts - every 15 minutes
*/15 * * * * root curl -s -X GET "${INVENTORY_URL}/api/cron/alerts" -H "Authorization: Bearer ${CRON_SECRET}" >> /var/log/inventory/alerts.log 2>&1

# Email monitor - every 5 minutes
*/5 * * * * root curl -s -X GET "${INVENTORY_URL}/api/cron/email-monitor" -H "Authorization: Bearer ${CRON_SECRET}" >> /var/log/inventory/email-monitor.log 2>&1

# Ads sync - daily at 3 AM
0 3 * * * root curl -s -X POST "${INVENTORY_URL}/api/cron/ads-sync" -H "X-Cron-Secret: ${CRON_SECRET}" >> /var/log/inventory/ads-sync.log 2>&1

# Retention cleanup - daily at 4 AM
0 4 * * * root curl -s -X POST "${INVENTORY_URL}/api/cron/retention-cleanup" -H "X-Cron-Secret: ${CRON_SECRET}" >> /var/log/inventory/retention-cleanup.log 2>&1
```

## Cloud Scheduler (Vercel/Railway/etc.)

Most cloud platforms support cron job configuration:

### Vercel Cron

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/alerts",
      "schedule": "*/15 * * * *"
    },
    {
      "path": "/api/cron/ads-sync",
      "schedule": "0 3 * * *"
    },
    {
      "path": "/api/cron/retention-cleanup",
      "schedule": "0 4 * * *"
    }
  ]
}
```

Note: Vercel Cron sets the `CRON_SECRET` automatically via the Vercel platform.

## Data Retention Policy

The retention cleanup endpoint enforces the following policies:

| Model | Retention Period | Rationale |
|-------|-----------------|-----------|
| KeywordMetric | 12 months | Performance data analysis window |
| SalesDaily | 12 months | Year-over-year comparison |
| SyncLog (completed) | 12 months | Audit trail |
| SyncLog (failed) | 24 months | Extended debugging period |

## Monitoring

### Check Timer Status

```bash
# List all inventory timers
systemctl list-timers | grep inventory

# Check specific timer
sudo systemctl status inventory-retention-cleanup.timer
```

### View Logs

```bash
# Recent cleanup activity
tail -50 /var/log/inventory/retention-cleanup.log

# Last response
cat /var/log/inventory/retention-cleanup-last.json | jq .
```

### Manual Trigger

```bash
# Trigger retention cleanup manually
curl -X POST "http://172.16.20.50:4545/api/cron/retention-cleanup" \
  -H "X-Cron-Secret: $(grep CRON_SECRET /home/pbrown/SkuInventory/docker/.env | cut -d= -f2)"
```

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| 401 Unauthorized | CRON_SECRET mismatch | Verify secret matches docker/.env |
| 500 Server Error | Database connection | Check app and database health |
| Timeout | Large cleanup | Increase TimeoutSec (retention can take time) |
| No records deleted | No old data | Normal - data hasn't aged past retention period |

## Related Documentation

- [Email Monitor Cron](./EMAIL-MONITOR-CRON.md) - Detailed email monitor setup
- [Webhook Setup](./WEBHOOK-SETUP.md) - GitHub webhook configuration
