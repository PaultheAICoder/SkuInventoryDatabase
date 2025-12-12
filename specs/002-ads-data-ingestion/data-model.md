# Data Model: Amazon Ads Data Ingestion Foundation

**Feature**: 002-ads-data-ingestion
**Date**: 2025-12-12

## Entity Relationship Diagram

```
┌─────────────┐     ┌─────────────────────┐     ┌─────────────┐
│   Company   │────<│ IntegrationCredential│     │    Brand    │
└─────────────┘     └─────────────────────┘     └─────────────┘
                              │                        │
                              │                        │
                    ┌─────────┴─────────┐              │
                    │                   │              │
              ┌─────▼─────┐     ┌───────▼───────┐     │
              │AdPortfolio│     │ShopifyConnection│    │
              └─────┬─────┘     └───────────────┘     │
                    │                                  │
              ┌─────▼─────┐                           │
              │ AdCampaign│                           │
              └─────┬─────┘                           │
                    │                                  │
              ┌─────▼─────┐                           │
              │  AdGroup  │                           │
              └─────┬─────┘                           │
                    │                                  │
              ┌─────▼───────┐     ┌──────────────┐    │
              │KeywordMetric│     │AsinSkuMapping│────┤
              └─────────────┘     └──────────────┘    │
                                                      │
              ┌─────────────┐                         │
              │ SalesDaily  │─────────────────────────┘
              └─────────────┘

              ┌─────────────┐     ┌──────────────┐
              │   SyncLog   │     │ Notification │
              └─────────────┘     └──────────────┘
```

## New Prisma Models

### IntegrationCredential

Stores encrypted OAuth credentials for external service connections.

```prisma
model IntegrationCredential {
  id              String   @id @default(uuid())
  companyId       String
  company         Company  @relation(fields: [companyId], references: [id])
  brandId         String?
  brand           Brand?   @relation(fields: [brandId], references: [id])
  integrationType String   @db.VarChar(50) // "amazon_ads", "shopify", etc.

  // Encrypted credentials (format: iv:encrypted:authTag)
  encryptedAccessToken  String   @db.Text
  encryptedRefreshToken String?  @db.Text

  // OAuth metadata
  scopes          String[] // PostgreSQL array
  expiresAt       DateTime?

  // Connection status
  status          String   @default("active") @db.VarChar(20) // "active", "expired", "revoked", "error"
  lastUsedAt      DateTime?
  lastErrorAt     DateTime?
  lastError       String?  @db.Text

  // External account info
  externalAccountId   String?  @db.VarChar(100)
  externalAccountName String?  @db.VarChar(200)

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // Relations
  adPortfolios    AdPortfolio[]
  syncLogs        SyncLog[]

  @@unique([companyId, brandId, integrationType])
  @@index([companyId, integrationType])
  @@index([status])
}
```

### AdPortfolio

Represents an Amazon Ads portfolio container.

```prisma
model AdPortfolio {
  id                    String   @id @default(uuid())
  credentialId          String
  credential            IntegrationCredential @relation(fields: [credentialId], references: [id])

  externalId            String   @db.VarChar(100) // Amazon portfolio ID
  name                  String   @db.VarChar(200)
  state                 String   @default("enabled") @db.VarChar(20) // "enabled", "paused", "archived"

  // Budget info (optional)
  budgetAmount          Decimal? @db.Decimal(10, 2)
  budgetCurrencyCode    String?  @db.VarChar(3) // "USD"
  budgetPolicy          String?  @db.VarChar(20) // "dateRange", "monthlyRecurring"

  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  // Relations
  campaigns             AdCampaign[]
  keywordMetrics        KeywordMetric[]

  @@unique([credentialId, externalId])
  @@index([credentialId])
}
```

### AdCampaign

Represents an Amazon Ads campaign.

```prisma
model AdCampaign {
  id              String      @id @default(uuid())
  portfolioId     String?
  portfolio       AdPortfolio? @relation(fields: [portfolioId], references: [id])
  credentialId    String      // Denormalized for queries without portfolio

  externalId      String      @db.VarChar(100) // Amazon campaign ID
  name            String      @db.VarChar(200)
  campaignType    String      @db.VarChar(50) // "sponsoredProducts", "sponsoredBrands", "sponsoredDisplay"
  targetingType   String?     @db.VarChar(50) // "manual", "auto"
  state           String      @default("enabled") @db.VarChar(20)

  // Budget
  dailyBudget     Decimal?    @db.Decimal(10, 2)

  // Dates
  startDate       DateTime?   @db.Date
  endDate         DateTime?   @db.Date

  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  // Relations
  adGroups        AdGroup[]
  keywordMetrics  KeywordMetric[]

  @@unique([credentialId, externalId])
  @@index([portfolioId])
  @@index([credentialId])
}
```

### AdGroup

Represents an Amazon Ads ad group within a campaign.

```prisma
model AdGroup {
  id              String     @id @default(uuid())
  campaignId      String
  campaign        AdCampaign @relation(fields: [campaignId], references: [id])

  externalId      String     @db.VarChar(100) // Amazon ad group ID
  name            String     @db.VarChar(200)
  state           String     @default("enabled") @db.VarChar(20)
  defaultBid      Decimal?   @db.Decimal(10, 2)

  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  // Relations
  keywordMetrics  KeywordMetric[]

  @@unique([campaignId, externalId])
  @@index([campaignId])
}
```

### KeywordMetric

Stores keyword/search term performance data from API or CSV uploads.

```prisma
model KeywordMetric {
  id              String      @id @default(uuid())

  // Hierarchy (nullable for CSV imports without full context)
  portfolioId     String?
  portfolio       AdPortfolio? @relation(fields: [portfolioId], references: [id])
  campaignId      String?
  campaign        AdCampaign?  @relation(fields: [campaignId], references: [id])
  adGroupId       String?
  adGroup         AdGroup?     @relation(fields: [adGroupId], references: [id])

  // Keyword identification
  keyword         String       @db.VarChar(500)
  matchType       String       @db.VarChar(20) // "exact", "phrase", "broad", "auto"

  // Time dimension
  date            DateTime     @db.Date

  // Performance metrics
  impressions     Int          @default(0)
  clicks          Int          @default(0)
  ctr             Decimal?     @db.Decimal(8, 4) // Click-through rate
  spend           Decimal      @default(0) @db.Decimal(10, 2)
  cpc             Decimal?     @db.Decimal(10, 2) // Cost per click
  orders          Int          @default(0)
  sales           Decimal      @default(0) @db.Decimal(10, 2)
  roas            Decimal?     @db.Decimal(10, 2) // Return on ad spend
  conversionRate  Decimal?     @db.Decimal(8, 4)
  acos            Decimal?     @db.Decimal(8, 4) // Advertising cost of sales

  // Source tracking
  source          String       @db.VarChar(50) // "api", "csv_amazon", "csv_zonguru", "csv_helium10"
  sourceFileName  String?      @db.VarChar(255)

  // Extra data from CSV (for columns we don't have dedicated fields for)
  metadata        Json         @default("{}")

  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  @@unique([portfolioId, campaignId, adGroupId, keyword, matchType, date, source])
  @@index([portfolioId, date])
  @@index([campaignId, date])
  @@index([keyword])
  @@index([date])
}
```

### SalesDaily

Aggregated daily sales with organic/ad attribution.

```prisma
model SalesDaily {
  id              String   @id @default(uuid())
  brandId         String
  brand           Brand    @relation(fields: [brandId], references: [id])

  // Product identification
  asin            String?  @db.VarChar(20) // Amazon ASIN
  skuId           String?  // FK to internal SKU (via AsinSkuMapping)

  // Time dimension
  date            DateTime @db.Date

  // Sales breakdown
  totalSales      Decimal  @db.Decimal(10, 2)
  adAttributedSales Decimal @db.Decimal(10, 2)
  organicSales    Decimal  @db.Decimal(10, 2) // Calculated: total - adAttributed

  // Source channel
  channel         String   @db.VarChar(50) // "amazon", "shopify"

  // Metadata
  unitsTotal      Int?
  unitsAdAttributed Int?
  unitsOrganic    Int?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([brandId, asin, date, channel])
  @@index([brandId, date])
  @@index([asin])
  @@index([date])
}
```

### AsinSkuMapping

Maps Amazon ASINs to internal SKU codes.

```prisma
model AsinSkuMapping {
  id          String   @id @default(uuid())
  brandId     String
  brand       Brand    @relation(fields: [brandId], references: [id])

  asin        String   @db.VarChar(20)
  skuId       String
  sku         SKU      @relation(fields: [skuId], references: [id])

  // Optional metadata
  productName String?  @db.VarChar(500) // Amazon product name for reference

  createdAt   DateTime @default(now())
  createdById String
  createdBy   User     @relation(fields: [createdById], references: [id])

  @@unique([brandId, asin])
  @@index([brandId])
  @@index([skuId])
}
```

### SyncLog

Records all sync operations for audit and debugging.

```prisma
model SyncLog {
  id              String   @id @default(uuid())
  credentialId    String?
  credential      IntegrationCredential? @relation(fields: [credentialId], references: [id])

  syncType        String   @db.VarChar(50) // "amazon_ads_full", "amazon_ads_incremental", "shopify_orders", "csv_upload", "retention_cleanup"
  status          String   @db.VarChar(20) // "started", "completed", "failed", "partial"

  startedAt       DateTime @default(now())
  completedAt     DateTime?

  // Metrics
  recordsProcessed Int     @default(0)
  recordsCreated   Int     @default(0)
  recordsUpdated   Int     @default(0)
  recordsDeleted   Int     @default(0)
  recordsFailed    Int     @default(0)

  // Error details
  errorMessage    String?  @db.Text
  errorDetails    Json     @default("{}")

  // For CSV uploads
  fileName        String?  @db.VarChar(255)
  fileSize        Int?     // bytes

  triggeredById   String?
  triggeredBy     User?    @relation(fields: [triggeredById], references: [id])

  @@index([credentialId, startedAt(sort: Desc)])
  @@index([syncType, status])
  @@index([startedAt(sort: Desc)])
}
```

### Notification

In-app notifications for sync failures and other alerts.

```prisma
model Notification {
  id          String    @id @default(uuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id])

  type        String    @db.VarChar(50) // "sync_failure", "credential_expired", "info"
  title       String    @db.VarChar(200)
  message     String    @db.Text

  // Link to related entity
  relatedType String?   @db.VarChar(50) // "sync_log", "credential"
  relatedId   String?

  read        Boolean   @default(false)
  readAt      DateTime?
  dismissedAt DateTime?

  createdAt   DateTime  @default(now())

  @@index([userId, read])
  @@index([userId, createdAt(sort: Desc)])
}
```

## Model Relationships to Add to Existing Models

### Company

```prisma
// Add to Company model
integrationCredentials IntegrationCredential[]
```

### Brand

```prisma
// Add to Brand model
integrationCredentials IntegrationCredential[]
salesDaily            SalesDaily[]
asinSkuMappings       AsinSkuMapping[]
```

### SKU

```prisma
// Add to SKU model
asinMappings          AsinSkuMapping[]
```

### User

```prisma
// Add to User model
asinMappingsCreated   AsinSkuMapping[]
syncLogsTriggered     SyncLog[]
notifications         Notification[]
```

## State Transitions

### IntegrationCredential Status

```
[new] → active → expired → active (after refresh)
                    ↓
active → revoked (user disconnects or token revoked externally)
                    ↓
active → error (API errors, will retry)
```

### SyncLog Status

```
started → completed (success)
        → failed (unrecoverable error)
        → partial (some records failed, logged in errorDetails)
```

## Validation Rules

| Entity | Field | Rule |
|--------|-------|------|
| IntegrationCredential | integrationType | Enum: "amazon_ads", "shopify" |
| KeywordMetric | matchType | Enum: "exact", "phrase", "broad", "auto" |
| KeywordMetric | impressions, clicks, orders | >= 0 |
| KeywordMetric | spend, sales | >= 0 |
| SalesDaily | organicSales | >= 0 (cap at 0 if calculation yields negative) |
| SyncLog | status | Enum: "started", "completed", "failed", "partial" |

## Indexes for Query Performance

Key query patterns and supporting indexes:

1. **Dashboard: Portfolio metrics by date range**
   - `KeywordMetric(portfolioId, date)`

2. **Keyword explorer: Search by keyword**
   - `KeywordMetric(keyword)`

3. **Sales analytics: Brand sales by date**
   - `SalesDaily(brandId, date)`

4. **Sync history: Recent syncs for credential**
   - `SyncLog(credentialId, startedAt DESC)`

5. **Notifications: Unread for user**
   - `Notification(userId, read)`
