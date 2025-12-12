# Quickstart Guide: Amazon Ads Data Ingestion Foundation

**Feature**: 002-ads-data-ingestion
**Date**: 2025-12-12

## Overview

This guide walks through setting up and using the Amazon Ads data ingestion system.

## Prerequisites

1. **Amazon Developer Account** with Advertising API access
2. **Shopify Partner Account** (for Shopify integration)
3. Running instance of Trevor Inventory (port 4545)
4. Admin user account

## Environment Setup

Add these environment variables to your `.env.local`:

```env
# Amazon Ads OAuth
AMAZON_ADS_CLIENT_ID=your_client_id
AMAZON_ADS_CLIENT_SECRET=your_client_secret
AMAZON_ADS_REDIRECT_URI=http://localhost:4545/api/integrations/amazon-ads/callback

# Credential Encryption (generate: openssl rand -hex 32)
CREDENTIAL_ENCRYPTION_KEY=your_32_byte_hex_key

# Shopify OAuth (if not already configured)
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret

# Cron Secret (for scheduled jobs)
CRON_SECRET=your_random_secret
```

## Quick Start Scenarios

### Scenario 1: Connect Amazon Ads Account

1. Log in as admin user
2. Navigate to **Settings → Integrations**
3. Click **"Connect Amazon Ads"**
4. Complete Amazon OAuth flow
5. Verify "Connected" status appears

**Expected Result**: Green "Connected" badge with account name displayed.

### Scenario 2: Initial Data Sync

After connecting:

1. Click **"Sync Now"** on the Amazon Ads card
2. Select date range (default: last 30 days)
3. Choose **"Full Sync"**
4. Wait for sync to complete (up to 10 minutes for first sync)

**Expected Result**: Sync log shows "Completed" with record counts.

### Scenario 3: Upload Keyword CSV

1. Export search term report from Amazon Ads console
2. Navigate to **Integrations → CSV Upload**
3. Select source type: "Amazon Search Term Report"
4. Upload the CSV file
5. Review validation results
6. Confirm import

**Expected Result**: Keywords appear in database, queryable by date range.

### Scenario 4: Connect Shopify (Read-Only)

1. Navigate to **Settings → Integrations**
2. Click **"Connect Shopify"**
3. Enter your store name (e.g., `mystore`)
4. Complete Shopify OAuth flow
5. Verify only read scopes were requested

**Expected Result**: Shopify card shows "Connected (Read-Only)".

### Scenario 5: Map ASIN to Internal SKU

1. Navigate to **Settings → ASIN Mappings**
2. Find unmapped ASIN in list
3. Click **"Map to SKU"**
4. Select matching internal SKU from dropdown
5. Save mapping

**Expected Result**: ASIN shows as mapped with linked SKU code.

### Scenario 6: View Sync Failure Notification

1. Simulate auth failure (or wait for credential expiry)
2. Log in to dashboard
3. Observe notification banner at top

**Expected Result**: Banner shows "Amazon Ads Sync Failed" with retry option.

## Verification Steps

### Database Verification

```sql
-- Check credentials stored and encrypted
SELECT id, integration_type, status,
       LEFT(encrypted_access_token, 20) as token_preview
FROM integration_credentials;

-- Check portfolio data imported
SELECT name, state, budget_amount
FROM ad_portfolios;

-- Check keyword metrics imported
SELECT keyword, impressions, clicks, spend, date, source
FROM keyword_metrics
ORDER BY date DESC
LIMIT 10;

-- Check sales daily calculated
SELECT asin, date, total_sales, ad_attributed_sales, organic_sales
FROM sales_daily
ORDER BY date DESC
LIMIT 10;
```

### API Verification

```bash
# Check Amazon Ads connection status
curl -X GET http://localhost:4545/api/integrations/amazon-ads/status \
  -H "Cookie: your_session_cookie"

# Check sync logs
curl -X GET http://localhost:4545/api/sync-logs?limit=5 \
  -H "Cookie: your_session_cookie"

# Check unmapped ASINs
curl -X GET http://localhost:4545/api/asin-mapping?unmappedOnly=true \
  -H "Cookie: your_session_cookie"
```

## Test Data

For development/testing, use these sample CSV formats:

### Amazon Search Term Report Sample

```csv
Campaign Name,Ad Group Name,Targeting,Match Type,Customer Search Term,Impressions,Clicks,Click-Thru Rate (CTR),Cost Per Click (CPC),Spend,7 Day Total Sales,Total Advertising Cost of Sales (ACoS),Total Return on Advertising Spend (RoAS),7 Day Total Orders (#),7 Day Conversion Rate
Discovery - Auto,Auto Group,auto,AUTO,tonsil stones,1500,45,3.00%,$0.85,$38.25,$125.00,30.60%,3.27,5,11.11%
Accelerate - Exact,Exact Keywords,tonsil stone remover,EXACT,tonsil stone remover,2500,125,5.00%,$0.92,$115.00,$450.00,25.56%,3.91,12,9.60%
```

### ZonGuru Sample

```csv
Keyword,Search Volume,Competition,Opportunity Score,CPR,Title Density,Relevancy Score
tonsil stone remover,14800,Medium,75,285,0.65,0.92
tonsil tool,8500,Low,82,175,0.45,0.88
```

## Troubleshooting

### OAuth Callback Error

**Problem**: Redirect fails after Amazon authorization

**Solution**:
1. Verify `AMAZON_ADS_REDIRECT_URI` matches registered URI exactly
2. Check for trailing slashes
3. Ensure app is registered for correct marketplace (US)

### CSV Upload Validation Fails

**Problem**: "Missing columns" error

**Solution**:
1. Ensure CSV is from supported source (Amazon, ZonGuru, Helium10)
2. Check column headers match expected format
3. Remove any extra header rows from export

### Sync Timeout

**Problem**: Sync takes >10 minutes

**Solution**:
1. Check Amazon Ads API rate limits
2. Reduce date range for initial sync
3. Check for API errors in sync log

### Negative Organic Sales

**Problem**: Organic sales shows as 0 when it should be positive

**Solution**:
1. This is expected behavior (capped at 0)
2. Review ad attribution data for accuracy
3. Check if total sales data is complete

## Next Steps

After MVP-0 is complete:

1. **MVP-1**: Build dashboards to visualize imported data
2. **MVP-2**: Add recommendation engine for keyword optimization
