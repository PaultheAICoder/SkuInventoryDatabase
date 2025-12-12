# Research: Amazon Ads Data Ingestion Foundation

**Feature**: 002-ads-data-ingestion
**Date**: 2025-12-12

## Research Tasks Completed

### 1. Amazon Ads API Integration

**Decision**: Use Amazon Advertising API v3 with OAuth 2.0 LWA (Login with Amazon)

**Rationale**:
- Amazon Advertising API is the official API for programmatic access to Sponsored Products, Sponsored Brands, and Sponsored Display data
- OAuth 2.0 with LWA is required for third-party applications
- API provides portfolio, campaign, ad group, and keyword-level reporting
- US marketplace endpoint: `advertising-api.amazon.com`

**Alternatives Considered**:
- SP-API (Selling Partner API): Focused on seller operations, not advertising data
- Manual report downloads: Not scalable, defeats automation purpose
- Third-party aggregators: Adds cost and dependency

**Key Implementation Details**:
- Register app in Amazon Developer Console
- Required scopes: `advertising::campaign_management`
- Refresh tokens valid for 1 year; access tokens expire in 1 hour
- Rate limits: 10 requests/second burst, sustained varies by endpoint
- Reports are async: request → poll → download

### 2. Shopify Integration (Read-Only)

**Decision**: Use Shopify Admin API with OAuth 2.0 and read-only scopes

**Rationale**:
- Existing ShopifyConnection model in schema can be activated
- Read-only scopes ensure no accidental store modifications
- REST Admin API is simpler than GraphQL for basic order sync

**Alternatives Considered**:
- GraphQL Admin API: More powerful but overkill for read-only order sync
- Shopify App Bridge: For embedded apps, not needed here
- CSV export: Manual, not automated

**Key Implementation Details**:
- Required scopes: `read_orders`, `read_products`, `read_customers`
- API version: Use latest stable (2024-01 or newer)
- Webhook support available but out of scope for MVP (polling instead)
- Rate limits: 2 requests/second leaky bucket

### 3. Credential Encryption

**Decision**: Use AES-256-GCM encryption with environment-based key management

**Rationale**:
- Industry standard for encrypting secrets at rest
- GCM provides authenticated encryption (integrity + confidentiality)
- Node.js crypto module provides native implementation
- Key stored in environment variable, not in database

**Alternatives Considered**:
- AWS KMS/Secrets Manager: Adds AWS dependency; overkill for current scale
- HashiCorp Vault: Complex setup for 5-10 user application
- Plain storage with DB encryption: Less defense in depth

**Key Implementation Details**:
- Encryption key: `CREDENTIAL_ENCRYPTION_KEY` env var (32 bytes)
- Each credential gets unique IV (initialization vector)
- Store as: `iv:encryptedData:authTag` (base64 encoded)
- Decrypt only when needed for API calls

### 4. CSV Parsing Strategy

**Decision**: Use `papaparse` library with streaming for large files

**Rationale**:
- Battle-tested CSV parsing library
- Supports streaming for memory-efficient large file processing
- Handles various CSV dialects (quoted fields, different delimiters)
- Works in both browser and Node.js

**Alternatives Considered**:
- `csv-parse`: Similar capability, slightly more complex API
- Manual parsing: Error-prone for edge cases
- `fast-csv`: Good but less ecosystem adoption

**Key Implementation Details**:
- Stream processing for files > 10MB
- Validate headers before processing rows
- Batch database inserts (1000 rows per batch)
- Progress tracking via row count callbacks

### 5. CSV Column Mappings

**Decision**: Maintain separate mapper modules per source with shared interface

**Amazon Ads Search Term Report Columns**:
```
Campaign Name, Ad Group Name, Targeting, Match Type, Customer Search Term,
Impressions, Clicks, Click-Thru Rate (CTR), Cost Per Click (CPC), Spend,
7 Day Total Sales, Total Advertising Cost of Sales (ACoS), Total Return on
Advertising Spend (RoAS), 7 Day Total Orders (#), 7 Day Conversion Rate
```

**ZonGuru Keyword Export Columns**:
```
Keyword, Search Volume, Competition, Opportunity Score, CPR, Title Density,
Relevancy Score
```

**Helium10 Keyword Export Columns**:
```
Phrase, Search Volume, Competing Products, CPR, Title Density, Word Count,
Cerebro IQ Score
```

**Mapping Strategy**:
- Define interface: `{ keyword, matchType, impressions, clicks, ctr, spend, cpc, orders, sales, roas, conversionRate, date, source }`
- Each mapper transforms source columns to interface
- Unknown columns stored in `metadata` JSON field for future use

### 6. Data Retention Implementation

**Decision**: Use PostgreSQL scheduled job (pg_cron) or application-level cleanup

**Rationale**:
- 12-month retention requires automated purging
- pg_cron is simple if available; otherwise nightly cron job
- Soft delete not needed (hard delete acceptable for metrics data)

**Alternatives Considered**:
- Table partitioning by month: Complex for current scale
- Manual cleanup: Unreliable, forgettable
- No retention (grow forever): Storage cost concerns

**Key Implementation Details**:
- Daily cleanup job at 3 AM
- Delete `KeywordMetric` where `date < NOW() - INTERVAL '12 months'`
- Delete `SalesDaily` where `date < NOW() - INTERVAL '12 months'`
- Log deletion counts to SyncLog

### 7. Notification System

**Decision**: Use in-app notification with database-backed queue

**Rationale**:
- Simpler than email for MVP
- No external email service dependency
- User sees notification on next login (aligns with Monday dashboard workflow)

**Alternatives Considered**:
- Email notifications: Available via ai-coder@vital-enterprises.com but deferred
- Push notifications: Requires service worker setup
- Slack webhook: Adds external dependency

**Key Implementation Details**:
- New `Notification` model: userId, type, title, message, read, createdAt
- Check for unread notifications on dashboard load
- Display as dismissible banner
- Mark read on dismiss or after 24 hours

## Dependencies Identified

| Dependency | Version | Purpose |
|------------|---------|---------|
| papaparse | ^5.4.x | CSV parsing |
| @types/papaparse | ^5.3.x | TypeScript types |
| (existing) crypto | Node.js built-in | Credential encryption |
| (existing) prisma | ^5.x | Database ORM |

## Environment Variables Required

```env
# Amazon Ads OAuth
AMAZON_ADS_CLIENT_ID=
AMAZON_ADS_CLIENT_SECRET=
AMAZON_ADS_REDIRECT_URI=

# Credential encryption
CREDENTIAL_ENCRYPTION_KEY=  # 32-byte hex string

# (existing) Shopify - already in schema
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
```

## Open Questions Resolved

All NEEDS CLARIFICATION items from spec have been resolved:
- ✅ US marketplace only (from clarify session)
- ✅ 12-month data retention (from clarify session)
- ✅ In-app notifications (from clarify session)
