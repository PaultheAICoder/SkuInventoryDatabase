# Tasks: Amazon Ads Data Ingestion Foundation

**Feature**: 002-ads-data-ingestion
**Branch**: `002-ads-data-ingestion`
**Generated**: 2025-12-12

## User Story Mapping

| User Story | Priority | Description |
|------------|----------|-------------|
| US1 | P1 | Connect Amazon Ads Account |
| US2 | P1 | Import Campaign & Portfolio Metrics |
| US3 | P2 | Upload Keyword/Search Term CSV Files |
| US4 | P2 | Connect Shopify Store (Read-Only) |
| US5 | P3 | Map ASINs to Internal SKUs |
| US6 | P3 | View Daily Sales Breakdown |

---

## Phase 1: Setup (Project Initialization)

**Goal**: Establish foundation infrastructure shared across all user stories.

- [x] T001 Install papaparse dependency: `npm install papaparse @types/papaparse`
- [x] T002 Add environment variables to .env.example in project root for AMAZON_ADS_CLIENT_ID, AMAZON_ADS_CLIENT_SECRET, AMAZON_ADS_REDIRECT_URI, CREDENTIAL_ENCRYPTION_KEY, CRON_SECRET
- [x] T003 Create credential encryption utility in src/lib/encryption.ts with encrypt() and decrypt() functions using AES-256-GCM; include audit logging wrapper that logs credential access/modification events (FR-023)

---

## Phase 2: Foundational (Database Schema)

**Goal**: Add all new Prisma models required by multiple user stories. Must complete before any story implementation.

- [x] T004 Add IntegrationCredential model to prisma/schema.prisma per data-model.md specification
- [x] T005 [P] Add AdPortfolio model to prisma/schema.prisma per data-model.md specification
- [x] T006 [P] Add AdCampaign model to prisma/schema.prisma per data-model.md specification
- [x] T007 [P] Add AdGroup model to prisma/schema.prisma per data-model.md specification
- [x] T008 [P] Add KeywordMetric model to prisma/schema.prisma per data-model.md specification
- [x] T009 [P] Add SalesDaily model to prisma/schema.prisma per data-model.md specification
- [x] T010 [P] Add AsinSkuMapping model to prisma/schema.prisma per data-model.md specification
- [x] T011 [P] Add SyncLog model to prisma/schema.prisma per data-model.md specification
- [x] T012 [P] Add Notification model to prisma/schema.prisma per data-model.md specification
- [x] T013 Add relations to existing Company model in prisma/schema.prisma: integrationCredentials
- [x] T014 [P] Add relations to existing Brand model in prisma/schema.prisma: integrationCredentials, salesDaily, asinSkuMappings
- [x] T015 [P] Add relations to existing SKU model in prisma/schema.prisma: asinMappings
- [x] T016 [P] Add relations to existing User model in prisma/schema.prisma: asinMappingsCreated, syncLogsTriggered, notifications
- [x] T017 Run prisma migrate dev to generate migration: `npx prisma migrate dev --name add-ads-data-ingestion-models`
- [x] T018 Run prisma generate to update client: `npx prisma generate`

---

## Phase 3: User Story 1 - Connect Amazon Ads Account (P1)

**Goal**: Enable admin users to connect Amazon Ads via OAuth2.

**Independent Test**: Admin can complete OAuth flow and see "Connected" status with account name.

### Models & Services

- [x] T019 [US1] Create Amazon Ads types in src/services/amazon-ads/types.ts defining AmazonAdsCredential, AmazonAdsTokenResponse, AmazonAdsProfile interfaces
- [x] T020 [US1] Create Amazon Ads API client in src/services/amazon-ads/client.ts with methods: getAuthUrl(), exchangeCode(), refreshToken(), getProfiles(); include automatic token refresh middleware that refreshes expired access tokens (1-hour expiry) using stored refresh token before API calls

### API Routes

- [x] T021 [US1] Create POST /api/integrations/amazon-ads/connect/route.ts to initiate OAuth flow, generate state token, return auth URL
- [x] T022 [US1] Create GET /api/integrations/amazon-ads/callback/route.ts to handle OAuth callback, exchange code, encrypt and store credentials
- [x] T023 [US1] Create POST /api/integrations/amazon-ads/disconnect/route.ts to revoke and delete credentials (admin only)
- [x] T024 [US1] Create GET /api/integrations/amazon-ads/status/route.ts to return connection status and last sync info

### UI Components

- [x] T025 [US1] Create Amazon Ads connection card component in src/components/integrations/amazon-ads-card.tsx showing status, account name, connect/disconnect buttons
- [x] T026 [US1] Create sync status display component in src/components/integrations/sync-status.tsx showing last sync time and status badge
- [x] T027 [US1] Create integrations management page in src/app/(dashboard)/integrations/page.tsx with Amazon Ads card

---

## Phase 4: User Story 2 - Import Campaign & Portfolio Metrics (P1)

**Goal**: Sync portfolio, campaign, ad group data from Amazon Ads API.

**Independent Test**: After manual sync, verify portfolios/campaigns appear in database with correct metrics.

**Depends on**: US1 (requires connected account)

### Services

- [x] T028 [US2] Extend Amazon Ads client in src/services/amazon-ads/client.ts with methods: getPortfolios(), getCampaigns(), getAdGroups(), requestReport(), getReportStatus(), downloadReport()
- [x] T029 [US2] Create sync orchestration service in src/services/amazon-ads/sync.ts with syncAll(), syncPortfolios(), syncCampaigns(), syncAdGroups(), syncMetrics() methods
- [x] T030 [US2] Add SyncLog creation and update logic to sync service for audit trail

### API Routes

- [x] T031 [US2] Create POST /api/integrations/amazon-ads/sync/route.ts to trigger manual sync with date range options
- [x] T032 [US2] Create GET /api/sync-logs/route.ts to list sync history with filtering by credential, type, status
- [x] T033 [US2] Create POST /api/cron/ads-sync/route.ts for scheduled daily sync (cron secret auth)

### UI Updates

- [x] T034 [US2] Add "Sync Now" button to amazon-ads-card.tsx that triggers manual sync
- [x] T035 [US2] Add sync history section to integrations page showing recent sync logs

---

## Phase 5: User Story 3 - Upload Keyword/Search Term CSV Files (P2)

**Goal**: Upload and parse CSV files from Amazon, ZonGuru, and Helium10.

**Independent Test**: Upload sample CSV and verify keywords appear in database with correct metrics.

### Services

- [x] T036 [US3] Create CSV/XLSX parser service in src/services/csv/parser.ts with parseFile(), validateHeaders(), processRows() using papaparse (CSV) and xlsx (XLSX) streaming
- [x] T037 [US3] Create Amazon search term CSV mapper in src/services/csv/mappers/amazon-search-term.ts implementing column-to-field mapping
- [x] T038 [US3] [P] Create ZonGuru CSV mapper in src/services/csv/mappers/zonguru.ts implementing column-to-field mapping
- [x] T039 [US3] [P] Create Helium10 CSV mapper in src/services/csv/mappers/helium10.ts implementing column-to-field mapping
- [x] T040 [US3] Create mapper registry in src/services/csv/mappers/index.ts to select appropriate mapper by source type

### API Routes

- [x] T041 [US3] Create POST /api/csv/upload/route.ts to handle multipart file upload (CSV/XLSX), validate, and process in background
- [x] T042 [US3] Create GET /api/csv/upload/[uploadId]/status/route.ts to return processing progress and results

### UI Components

- [x] T043 [US3] Create CSV/XLSX upload component in src/components/integrations/csv-upload.tsx with file picker, source selector, progress display
- [x] T044 [US3] Add CSV/XLSX upload section to integrations page with upload history

---

## Phase 6: User Story 4 - Connect Shopify Store (Read-Only) (P2)

**Goal**: Enable admin users to connect Shopify with read-only access.

**Independent Test**: Admin can complete OAuth flow and see "Connected (Read-Only)" status.

### Services

- [x] T045 [US4] Extend existing Shopify service or create src/services/shopify/sync.ts with OAuth flow methods for read-only scopes
- [x] T046 [US4] Add order sync logic to Shopify sync service: fetchOrders(), syncOrdersToSalesDaily()

### API Routes

- [x] T047 [US4] Create POST /api/integrations/shopify/connect/route.ts to initiate OAuth with read-only scopes only
- [x] T048 [US4] Create GET /api/integrations/shopify/callback/route.ts to handle OAuth callback and store credentials
- [x] T049 [US4] Create POST /api/integrations/shopify/sync/route.ts to trigger manual order sync
- [x] T049a [US4] Create GET /api/integrations/shopify/status/route.ts to check connection status
- [x] T049b [US4] Create POST /api/integrations/shopify/disconnect/route.ts to disconnect Shopify store

### UI Components

- [x] T050 [US4] Create Shopify connection card in src/components/integrations/shopify-card.tsx showing read-only badge, status, sync button
- [x] T051 [US4] Add Shopify card to integrations page alongside Amazon Ads card

---

## Phase 7: User Story 5 - Map ASINs to Internal SKUs (P3)

**Goal**: Allow users to map Amazon ASINs to internal SKU codes.

**Independent Test**: Create mapping between ASIN and SKU, verify it persists and appears in queries.

### API Routes

- [x] T052 [US5] Create GET /api/asin-mapping/route.ts to list mappings with unmapped ASIN detection and SKU suggestions
- [x] T053 [US5] Create POST /api/asin-mapping/route.ts to create new ASIN-SKU mapping
- [x] T054 [US5] Create DELETE /api/asin-mapping/[id]/route.ts to remove mapping (admin only)

### UI Components

- [x] T055 [US5] Create ASIN mapping list component showing mapped and unmapped ASINs with suggested SKU matches
- [x] T056 [US5] Create ASIN mapping modal/form for selecting SKU to map
- [x] T057 [US5] Add ASIN mapping section to integrations page or create dedicated settings page

---

## Phase 8: User Story 6 - View Daily Sales Breakdown (P3)

**Goal**: Calculate and store daily sales with organic/ad attribution.

**Independent Test**: Query daily sales records and verify total/ad-attributed/organic breakdown is correct.

**Depends on**: US2 (requires synced ads data), US4 (optional Shopify data)

### Services

- [x] T058 [US6] Create sales calculator service in src/services/sales-daily/calculator.ts with calculateDailySales(), calculateOrganicSales() methods
- [x] T059 [US6] Add organic sales calculation logic: organic = max(0, total - adAttributed)
- [x] T060 [US6] Integrate sales calculation into Amazon Ads sync service to populate SalesDaily after each sync (already integrated in Shopify sync)

### API Routes

- [x] T061 [US6] Create GET /api/sales-daily/route.ts to query daily sales by brand, ASIN, date range with organic percentage

---

## Phase 9: Polish & Cross-Cutting Concerns

**Goal**: Notifications, retention cleanup, and final polish.

### Notification System

- [x] T062 Create notification service in src/services/notifications.ts with createNotification(), markRead(), getUnreadForUser()
- [x] T063 Create GET /api/notifications/route.ts to list user notifications
- [x] T064 Create PATCH /api/notifications/[id]/route.ts to mark notification read/dismissed
- [x] T065 Add notification creation to sync failure handling in Amazon Ads sync service
- [ ] T066 Create notification banner component for dashboard header showing unread sync failure alerts → **GH Issue #268**

### Data Retention

- [ ] T067 Create POST /api/cron/retention-cleanup/route.ts to delete KeywordMetric and SalesDaily records older than 12 months → **GH Issue #266**
- [ ] T068 Add retention cleanup to SyncLog for audit trail → **GH Issue #266**
- [ ] T069 Document external scheduler configuration (cron job or pg_cron) to call /api/cron/ads-sync daily at 3AM and /api/cron/retention-cleanup daily at 4AM → **GH Issue #266**

### Final Integration

- [ ] T070 Add integrations link to main navigation/sidebar → **GH Issue #267**
- [ ] T071 Verify all API routes have proper auth checks (admin for connect/disconnect, admin/ops for sync/upload) → **GH Issue #267**
- [x] T072 Run npm run build to verify no TypeScript errors
- [x] T073 Run npm run lint to verify no linting errors

---

## Dependencies Graph

```
Phase 1 (Setup)
    ↓
Phase 2 (Database Schema)
    ↓
┌───────────────────────────────────────┐
│                                       │
↓                                       ↓
Phase 3 (US1: Connect Amazon)     Phase 6 (US4: Connect Shopify)
    ↓                                   │
Phase 4 (US2: Import Metrics)           │
    ↓                                   │
Phase 5 (US3: CSV Upload)               │
    ↓                                   ↓
    └───────────────────────────────────┘
                    ↓
            Phase 7 (US5: ASIN Mapping)
                    ↓
            Phase 8 (US6: Daily Sales)
                    ↓
            Phase 9 (Polish)
```

## Parallel Execution Opportunities

**Within Phase 2 (Schema)**:
- T005-T012 can run in parallel (independent model additions)
- T013-T016 can run in parallel (relation additions to existing models)

**Within Phase 5 (CSV)**:
- T037-T039 can run in parallel (independent mapper implementations)

**Across Phases**:
- Phase 3 (US1) and Phase 6 (US4) can run in parallel (independent OAuth flows)
- Phase 5 (US3) can start once Phase 3 is complete (only needs Amazon connection)

## Implementation Strategy

### MVP Scope (Recommended First Increment)

1. **Phase 1**: Setup (T001-T003)
2. **Phase 2**: Database schema (T004-T018)
3. **Phase 3**: US1 - Connect Amazon Ads (T019-T027)
4. **Phase 4**: US2 - Import Metrics (T028-T035)

This delivers a working Amazon Ads connection with data sync capability.

### Second Increment

5. **Phase 5**: US3 - CSV Upload (T036-T044)
6. **Phase 6**: US4 - Shopify Connection (T045-T051)

### Third Increment

7. **Phase 7**: US5 - ASIN Mapping (T052-T057)
8. **Phase 8**: US6 - Daily Sales (T058-T061)
9. **Phase 9**: Polish (T062-T072)

---

## Task Summary

| Phase | User Story | Task Count |
|-------|------------|------------|
| 1 | Setup | 3 |
| 2 | Foundational | 15 |
| 3 | US1 | 9 |
| 4 | US2 | 8 |
| 5 | US3 | 9 |
| 6 | US4 | 7 |
| 7 | US5 | 6 |
| 8 | US6 | 4 |
| 9 | Polish | 12 |
| **Total** | | **73** |
