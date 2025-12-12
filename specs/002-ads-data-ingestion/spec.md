# Feature Specification: Amazon Ads Data Ingestion Foundation

**Feature Branch**: `002-ads-data-ingestion`
**Created**: 2025-12-12
**Status**: Draft
**Input**: MVP-0 Amazon Ads Data Ingestion Foundation: Build the data ingestion layer for Amazon Ads intelligence.

## Clarifications

### Session 2025-12-12

- Q: Which Amazon marketplace(s) should be supported? → A: US marketplace only (amazon.com)
- Q: How long should keyword metrics and daily sales data be retained? → A: 12 months rolling retention
- Q: How should users be notified of sync failures? → A: In-app notification banner on next login (note: email via ai-coder@vital-enterprises.com available for future enhancement)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect Amazon Ads Account (Priority: P1)

As a brand owner, I want to securely connect my Amazon Ads account so that my advertising data can be automatically imported into the system.

**Why this priority**: This is the foundational integration that enables all other ads intelligence features. Without a secure connection, no data can flow into the system.

**Independent Test**: Can be fully tested by connecting an Amazon Ads account and verifying the connection status displays correctly. Delivers immediate value by establishing the secure data pipeline.

**Acceptance Scenarios**:

1. **Given** a user with admin permissions, **When** they navigate to Integrations and click "Connect Amazon Ads", **Then** they are guided through the OAuth authorization flow and upon success see a "Connected" status with the account name displayed.

2. **Given** a connected Amazon Ads account, **When** the user views the integration settings, **Then** they see connection status, last sync timestamp, and can disconnect if needed.

3. **Given** an Amazon Ads connection attempt fails, **When** the authorization is rejected or times out, **Then** the user sees a clear error message explaining what went wrong and how to retry.

---

### User Story 2 - Import Campaign & Portfolio Metrics (Priority: P1)

As a brand owner, I want my Amazon Ads campaign and portfolio performance metrics automatically imported so that I can view them in one place without manual report downloads.

**Why this priority**: This is the core data that powers all dashboards and recommendations. It must be reliable and complete.

**Independent Test**: Can be tested by verifying that after a sync, portfolio and campaign data appears in the database with correct metrics (Spend, Sales, ROAS, Impressions, Clicks, CPC, Orders).

**Acceptance Scenarios**:

1. **Given** a connected Amazon Ads account, **When** a sync is triggered (manually or scheduled), **Then** portfolio metrics are imported including portfolio name, spend, sales, ROAS, impressions, clicks, CPC, and orders for the selected date range.

2. **Given** a connected account with multiple portfolios (e.g., Discovery, Accelerate, Zon, Competitor Targeting), **When** data is synced, **Then** each portfolio's metrics are stored separately and can be queried independently.

3. **Given** a sync completes successfully, **When** the user views the sync history, **Then** they see the sync timestamp, record counts imported, and any warnings or errors encountered.

---

### User Story 3 - Upload Keyword/Search Term CSV Files (Priority: P2)

As a brand owner, I want to upload keyword performance CSV exports from Amazon Ads and third-party tools so that I can analyze all my keyword data in one place.

**Why this priority**: While API data provides campaign-level metrics, keyword-level data often requires CSV exports. This enables the full keyword performance workspace.

**Independent Test**: Can be tested by uploading a sample CSV file and verifying the keywords appear in the system with their metrics correctly parsed.

**Acceptance Scenarios**:

1. **Given** a user with ops or admin permissions, **When** they upload an Amazon Ads search term report CSV, **Then** the system parses and stores keyword, match type, impressions, clicks, CTR, spend, CPC, orders, sales, ROAS, and conversion rate.

2. **Given** a user uploads a ZonGuru or Helium10 keyword export, **When** the file is processed, **Then** the system maps known columns to internal fields and flags any unmapped columns for review.

3. **Given** a CSV with duplicate keywords across multiple uploads, **When** the file is processed, **Then** newer data updates existing records based on date range, maintaining a complete history.

4. **Given** a malformed or empty CSV file, **When** upload is attempted, **Then** the user sees validation errors before processing begins, explaining which rows or columns failed.

---

### User Story 4 - Connect Shopify Store (Read-Only) (Priority: P2)

As a brand owner, I want to connect my Shopify store with read-only access so that I can see Shopify sales data alongside my Amazon data.

**Why this priority**: Shopify integration provides cross-channel visibility. Read-only ensures security while enabling sales attribution analysis.

**Independent Test**: Can be tested by connecting a Shopify store and verifying orders sync with read-only permissions.

**Acceptance Scenarios**:

1. **Given** a user with admin permissions, **When** they connect a Shopify store, **Then** the system requests only read-only OAuth scopes (read_orders, read_products, read_customers) and displays the connected store name.

2. **Given** a connected Shopify store, **When** orders are synced, **Then** order data includes order ID, date, line items, quantities, prices, and customer info (for attribution, not marketing).

3. **Given** a Shopify connection, **When** the user views integration settings, **Then** they see confirmation that access is read-only and cannot modify store data.

---

### User Story 5 - Map ASINs to Internal SKUs (Priority: P3)

As a brand owner, I want to map Amazon ASINs to my internal SKU codes so that ads performance data connects to my inventory system.

**Why this priority**: SKU mapping enables joining ads data with inventory data for unified reporting. Can be deferred until dashboards need it.

**Independent Test**: Can be tested by creating a mapping between an ASIN and internal SKU, then verifying the mapping appears in queries that join ads and inventory data.

**Acceptance Scenarios**:

1. **Given** imported Amazon Ads data with ASINs, **When** a user views unmapped ASINs, **Then** they see a list with suggested matches based on product name similarity.

2. **Given** an unmapped ASIN, **When** the user selects an internal SKU to map it to, **Then** the mapping is saved and persists across future data imports.

3. **Given** a mapped ASIN, **When** ads data is queried alongside inventory data, **Then** the join produces combined records showing both ads metrics and inventory levels.

---

### User Story 6 - View Daily Sales Breakdown (Priority: P3)

As a brand owner, I want to see daily sales broken down by total, ad-attributed, and organic (derived) so that I can track my organic share over time.

**Why this priority**: This is an analytics feature that depends on ads data being reliably ingested first. Foundational but not blocking.

**Independent Test**: Can be tested by querying daily sales records and verifying the total/ad-attributed/organic breakdown is calculated correctly.

**Acceptance Scenarios**:

1. **Given** synced Amazon Ads data and total sales data, **When** daily sales are calculated, **Then** the system stores total sales, ad-attributed sales (from ads API), and organic sales (total minus ad-attributed).

2. **Given** daily sales records exist, **When** a user queries by SKU/ASIN and date range, **Then** they receive time-series data showing organic percentage trend.

---

### Edge Cases

- What happens when Amazon Ads API rate limits are hit? → Queue retries with exponential backoff; show "sync delayed" status to user.
- What happens when Shopify webhook delivers duplicate orders? → Deduplicate by shopifyOrderId; update existing record if changed.
- What happens when CSV upload contains 100,000+ rows? → Process in batches; show progress indicator; allow cancellation.
- What happens when credentials are revoked externally? → Detect auth failure on next sync; notify user to reconnect.
- What happens when organic sales calculation yields negative? → Cap at zero; flag as data inconsistency for review.
- What happens when a scheduled sync fails overnight? → Record failure in SyncLog; display in-app notification banner on user's next login with failure details and retry option.

## Requirements *(mandatory)*

### Functional Requirements

**Data Ingestion - Amazon Ads**
- **FR-001**: System MUST support OAuth2 authorization flow for Amazon Ads API connection.
- **FR-002**: System MUST store integration credentials encrypted at rest using AES-256-GCM (see Security section FR-021 for details).
- **FR-003**: System MUST import portfolio-level metrics: spend, sales, ROAS, impressions, clicks, CPC, orders.
- **FR-004**: System MUST import campaign-level metrics with portfolio association.
- **FR-005**: System MUST import ad group-level metrics with campaign association.
- **FR-006**: System MUST support manual sync trigger and scheduled sync (daily default).
- **FR-007**: System MUST log all sync operations with timestamps, record counts, and error details.

**Data Ingestion - CSV Upload**
- **FR-008**: System MUST accept CSV uploads for Amazon Ads search term reports.
- **FR-009**: System MUST accept CSV uploads from ZonGuru and Helium10 keyword exports.
- **FR-010**: System MUST validate CSV structure before processing and report specific errors.
- **FR-011**: System MUST support incremental updates (new data updates existing records by date).
- **FR-012**: System MUST handle files up to 50MB in size.

**Data Ingestion - Shopify**
- **FR-013**: System MUST support OAuth2 connection with read-only scopes only.
- **FR-014**: System MUST import orders, products, and customer data (read-only).
- **FR-015**: System MUST NOT request write permissions to Shopify stores.

**Data Model**
- **FR-016**: System MUST support multi-brand architecture (Brand entity with company association).
- **FR-017**: System MUST store credentials per integration type per brand.
- **FR-018**: System MUST track ASIN-to-SKU mappings with user-defined associations.
- **FR-019**: System MUST store daily sales records with total, ad-attributed, and organic-derived breakdown.
- **FR-020**: System MUST retain keyword metrics and daily sales data for 12 months rolling, automatically purging older records.

**Security**
- **FR-021**: System MUST encrypt all API credentials using AES-256-GCM with environment-based key management before storage; each credential gets unique IV; stored as iv:encryptedData:authTag format.
- **FR-022**: System MUST restrict integration management to admin users.
- **FR-023**: System MUST log all credential access and modification events for audit trail.
- **FR-024**: System MUST display an in-app notification banner when sync failures occur, visible on user's next login.

### Key Entities

- **IntegrationCredential**: Stores encrypted API tokens/keys for external services. Attributes: brand association, integration type (amazon_ads, shopify), encrypted token, refresh token, scopes, expiry, status.

- **AdPortfolio**: Represents an Amazon Ads portfolio. Attributes: external ID, name, brand association, creation date.

- **AdCampaign**: Represents an Amazon Ads campaign. Attributes: external ID, name, portfolio association, campaign type, status, daily budget.

- **AdGroup**: Represents an Amazon Ads ad group. Attributes: external ID, name, campaign association, status.

- **KeywordMetric**: Stores keyword/search term performance data. Attributes: keyword text, match type, portfolio/campaign association, date, impressions, clicks, CTR, spend, CPC, orders, sales, ROAS, conversion rate, source (api/csv).

- **SalesDaily**: Daily aggregated sales per SKU/ASIN. Attributes: SKU/ASIN, date, total sales, ad-attributed sales, organic sales (derived), source channel.

- **AsinSkuMapping**: Maps Amazon ASINs to internal SKU codes. Attributes: ASIN, SKU reference, brand, created date, created by.

- **SyncLog**: Records sync operations. Attributes: integration, sync type, start time, end time, status, records processed, errors.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can connect an Amazon Ads account in under 3 minutes following the guided flow.
- **SC-002**: System imports 30 days of historical data on initial sync within 10 minutes.
- **SC-003**: Daily scheduled syncs complete within 5 minutes for accounts with up to 50 campaigns.
- **SC-004**: CSV uploads of up to 50,000 rows complete processing within 2 minutes.
- **SC-005**: 100% of imported data is queryable within 1 minute of sync completion.
- **SC-006**: Users can map an ASIN to an internal SKU in under 30 seconds.
- **SC-007**: Zero write operations occur on connected Shopify stores (verified via API scope audit).
- **SC-008**: All credentials remain encrypted at rest (verified via security audit).

## Assumptions

- Amazon Ads integration targets US marketplace (amazon.com) only; other regions out of scope for MVP.
- Amazon Ads API provides portfolio, campaign, ad group, and keyword-level data via their Advertising API.
- ZonGuru and Helium10 CSV exports follow consistent column naming conventions that can be mapped.
- The existing Brand model in the schema is sufficient for multi-brand support.
- The existing ShopifyConnection model (currently V2-deferred) will be activated and extended.
- OAuth2 is the standard authentication method for both Amazon Ads and Shopify integrations.
- Daily sync frequency is sufficient for MVP; real-time sync is not required.
- Organic sales calculation uses the simple delta approach: organic = total - ad-attributed.

## Dependencies

- Amazon Ads API access (requires Amazon Developer account and app registration).
- Shopify Partner account for OAuth app creation.
- Existing Prisma schema and database infrastructure.
- Existing user authentication and permission system (admin/ops/viewer roles).

## Out of Scope

- Real-time streaming data ingestion (batch sync only for MVP).
- Automatic write-back to Amazon Ads (recommendations only, no account modifications).
- Google Ads or other advertising platform integrations.
- Advanced organic sales attribution models (delta approach only for MVP).
- Webhook-based real-time Shopify order updates (polling/manual sync for MVP).
