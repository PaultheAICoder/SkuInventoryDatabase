# GitHub Webhook Setup

This document describes how to configure GitHub webhooks for the SkuInventory project.

## Architecture

GitHub webhooks cannot reach private network IPs directly. We use [smee.io](https://smee.io) as a webhook proxy:

```
GitHub --> smee.io --> smee-client (local) --> http://172.16.20.50:4545/api/webhooks/github
```

## Current Configuration

- **Smee Channel**: https://smee.io/PSeXlK7Wg5bQrX
- **Target Endpoint**: http://172.16.20.50:4545/api/webhooks/github
- **GitHub Webhook ID**: 585474369
- **Events**: `issues` (specifically `closed` action)

## Quick Start

### 1. Start smee forwarder (manual)

```bash
npx smee -u https://smee.io/PSeXlK7Wg5bQrX --target http://172.16.20.50:4545/api/webhooks/github
```

Or run in background:

```bash
nohup npx smee -u https://smee.io/PSeXlK7Wg5bQrX --target http://172.16.20.50:4545/api/webhooks/github > /tmp/smee-inventory.log 2>&1 &
```

### 2. Install as systemd service (requires sudo)

```bash
sudo cp scripts/systemd/inventory-smee-webhook.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable inventory-smee-webhook.service
sudo systemctl start inventory-smee-webhook.service
```

## Verification

### Test the webhook

```bash
# Send test ping
gh api repos/PaultheAICoder/SkuInventoryDatabase/hooks/585474369/pings --method POST

# Check app logs for receipt
docker logs inventory-app 2>&1 | grep -i webhook
```

### Check webhook deliveries

```bash
gh api repos/PaultheAICoder/SkuInventoryDatabase/hooks/585474369/deliveries --jq '.[0]'
```

### Check smee forwarder status

```bash
# If running as background process
cat /tmp/smee-inventory.log

# If running as systemd service
sudo systemctl status inventory-smee-webhook
sudo journalctl -u inventory-smee-webhook -f
```

## Troubleshooting

### Webhook returns 502

The smee forwarder is not running. Start it manually or via systemd.

### No webhook logs in app

1. Check smee is connected: `cat /tmp/smee-inventory.log`
2. Check smee channel matches webhook config
3. Verify Docker container is running: `docker ps | grep inventory-app`

### Email not sent on issue close

1. Check issue body has submitter info: `**Submitted by**: Name (email@example.com)`
2. Check email config: `curl http://172.16.20.50:4545/api/webhooks/github`
3. Check app logs: `docker logs inventory-app 2>&1 | grep -i webhook`

## GitHub Webhook Configuration

If the webhook needs to be recreated:

```bash
WEBHOOK_SECRET=$(grep GITHUB_WEBHOOK_SECRET .env | cut -d= -f2)
gh api repos/PaultheAICoder/SkuInventoryDatabase/hooks --method POST \
  --input - <<EOF
{
  "name": "web",
  "active": true,
  "events": ["issues"],
  "config": {
    "url": "https://smee.io/PSeXlK7Wg5bQrX",
    "content_type": "json",
    "secret": "$WEBHOOK_SECRET"
  }
}
EOF
```

## Related Documentation

- [Email Monitor Cron](./EMAIL-MONITOR-CRON.md) - Handles reply processing
- Webhook handler: `src/app/api/webhooks/github/route.ts`
