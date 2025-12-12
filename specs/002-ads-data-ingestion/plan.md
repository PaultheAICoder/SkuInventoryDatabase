# Implementation Plan: Amazon Ads Data Ingestion Foundation

**Branch**: `002-ads-data-ingestion` | **Date**: 2025-12-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-ads-data-ingestion/spec.md`

## Summary

Build the foundational data ingestion layer for Amazon Ads intelligence, enabling secure OAuth connections to Amazon Ads API (US marketplace), CSV upload for keyword data from Amazon/ZonGuru/Helium10, and read-only Shopify integration. This creates the data foundation for MVP-1 dashboards and MVP-2 recommendations.

## Technical Context

**Language/Version**: TypeScript 5.x (existing stack)
**Primary Dependencies**: Next.js 14 (App Router), Prisma ORM, existing auth system
**Storage**: PostgreSQL (existing, port 4546)
**Testing**: Jest + React Testing Library (existing)
**Target Platform**: Web application (Linux server, ports 4545/2345)
**Project Type**: Web application (existing monorepo structure)
**Performance Goals**: CSV uploads of 50k rows in <2 minutes; daily syncs in <5 minutes
**Constraints**: 12-month data retention; US marketplace only; read-only Shopify access
**Scale/Scope**: 5-10 users; up to 50 campaigns per brand; 50MB max CSV uploads

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Data Integrity & Auditability | ✅ PASS | SyncLog captures all sync operations; credentials logged |
| II. Simplicity First | ✅ PASS | MVP scope well-defined; no over-engineering |
| III. Extensibility by Design | ✅ PASS | Multi-brand support; IntegrationCredential per brand |
| IV. Security & Authorization | ✅ PASS | OAuth2, encrypted credentials, admin-only integration management |
| V. User-Centric Design | ✅ PASS | In-app notifications; clear error messages |

**Constitution Evolution Note**: The original constitution (V1) states "V1 has NO external integrations." This feature represents intentional evolution to V2+ scope as documented in the PRD. The Shopify models already exist in schema (marked V2-DEFERRED). This plan activates that deferred functionality.

## Project Structure

### Documentation (this feature)

```text
specs/002-ads-data-ingestion/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── api/
│   │   ├── integrations/
│   │   │   ├── amazon-ads/
│   │   │   │   ├── connect/route.ts      # OAuth initiation
│   │   │   │   ├── callback/route.ts     # OAuth callback
│   │   │   │   ├── disconnect/route.ts   # Disconnect integration
│   │   │   │   └── sync/route.ts         # Manual sync trigger
│   │   │   └── shopify/
│   │   │       ├── connect/route.ts
│   │   │       ├── callback/route.ts
│   │   │       └── sync/route.ts
│   │   ├── csv/
│   │   │   └── upload/route.ts           # CSV upload endpoint
│   │   ├── asin-mapping/
│   │   │   └── route.ts                  # ASIN-SKU mapping CRUD
│   │   └── cron/
│   │       └── ads-sync/route.ts         # Scheduled sync endpoint
│   └── (dashboard)/
│       └── integrations/
│           └── page.tsx                  # Integrations management UI
├── services/
│   ├── amazon-ads/
│   │   ├── client.ts                     # Amazon Ads API client
│   │   ├── sync.ts                       # Sync orchestration
│   │   └── types.ts                      # Amazon Ads types
│   ├── shopify/
│   │   └── sync.ts                       # Shopify sync (extend existing)
│   ├── csv/
│   │   ├── parser.ts                     # CSV parsing & validation
│   │   └── mappers/
│   │       ├── amazon-search-term.ts     # Amazon CSV mapper
│   │       ├── zonguru.ts                # ZonGuru CSV mapper
│   │       └── helium10.ts               # Helium10 CSV mapper
│   └── sales-daily/
│       └── calculator.ts                 # Organic sales calculation
├── lib/
│   └── encryption.ts                     # Credential encryption utilities
└── components/
    └── integrations/
        ├── amazon-ads-card.tsx           # Amazon Ads connection card
        ├── shopify-card.tsx              # Shopify connection card
        ├── csv-upload.tsx                # CSV upload component
        └── sync-status.tsx               # Sync status display

prisma/
└── schema.prisma                         # Extended with new models

tests/
├── integration/
│   └── api/
│       ├── amazon-ads.test.ts
│       └── csv-upload.test.ts
└── unit/
    └── services/
        ├── csv-parser.test.ts
        └── sales-calculator.test.ts
```

**Structure Decision**: Extends existing Next.js App Router structure. New API routes under `/api/integrations/` and `/api/csv/`. Services follow existing pattern in `/src/services/`. Prisma schema extended with new models for ads data.

## Complexity Tracking

| Deviation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Multiple CSV mappers | Different sources have different column formats | Single mapper would require complex conditional logic |
| Separate Amazon Ads client | OAuth flow and API structure differs from Shopify | Unified client would be more complex than two simple ones |

