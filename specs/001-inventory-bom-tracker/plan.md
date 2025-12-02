# Implementation Plan: V1 Inventory & BOM Tracker

**Branch**: `001-inventory-bom-tracker` | **Date**: 2025-12-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-inventory-bom-tracker/spec.md`

## Summary

Build an internal inventory management system for Tonsil Tech that tracks component inventory, manages SKU bill of materials (BOMs) with versioning, provides reorder status alerts, and calculates buildable unit capacity. The system replaces Excel + ChatGPT workflows with a reliable web application deployed via Docker on an internal corporate server.

## Technical Context

**Language/Version**: TypeScript 5.x (full-stack)
**Primary Dependencies**: Next.js 14 (App Router), Prisma ORM, TailwindCSS, shadcn/ui
**Storage**: PostgreSQL 16 (via Docker)
**Testing**: Vitest (unit), Playwright (e2e)
**Target Platform**: Linux server (internal network), Docker containerized
**Project Type**: Web application (frontend + backend in single Next.js app)
**Performance Goals**: UI operations < 200ms, support 10 concurrent users
**Constraints**: No external cloud services, Docker-only deployment, single PostgreSQL instance
**Scale/Scope**: 5-10 users, ~50k transactions/year, ~500 components, ~100 SKUs

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Data Integrity & Auditability | ✅ PASS | All inventory mutations create immutable Transaction records (FR-012); timestamps and user attribution on all entities (FR-026) |
| II. Simplicity First | ✅ PASS | Single Next.js app (no microservices); direct Prisma queries (no repository pattern); minimal dependencies |
| III. Extensibility by Design | ✅ PASS | Company/Brand entities in schema; foreign keys designed for future Location/Lot tables; API accepts optional params |
| IV. Security & Authorization | ✅ PASS | NextAuth.js for authentication; role-based middleware (Admin/Ops/Viewer); bcrypt password hashing; HTTPS via reverse proxy |
| V. User-Centric Design | ✅ PASS | Dashboard shows reorder status prominently; buildable units on SKU list; CSV export available; non-technical UI |

**Out of Scope Verification**: Plan excludes multi-location, lot tracking, external integrations, notifications - all prohibited in V1.

## Project Structure

### Documentation (this feature)

```text
specs/001-inventory-bom-tracker/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (API specs)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── app/                    # Next.js App Router
│   ├── (auth)/             # Auth pages (login, etc.)
│   ├── (dashboard)/        # Protected routes
│   │   ├── page.tsx        # Dashboard home
│   │   ├── components/     # Component management
│   │   ├── skus/           # SKU & BOM management
│   │   ├── transactions/   # Transaction log
│   │   ├── import/         # CSV import
│   │   └── settings/       # Admin settings
│   ├── api/                # API routes
│   │   ├── components/
│   │   ├── skus/
│   │   ├── boms/
│   │   ├── transactions/
│   │   ├── export/
│   │   └── import/
│   ├── layout.tsx
│   └── globals.css
├── components/             # Shared UI components
│   ├── ui/                 # shadcn/ui components
│   └── features/           # Feature-specific components
├── lib/
│   ├── db.ts               # Prisma client
│   ├── auth.ts             # NextAuth config
│   └── utils.ts            # Helpers
├── services/               # Business logic
│   ├── inventory.ts        # Inventory calculations
│   ├── bom.ts              # BOM cost calculations
│   └── export.ts           # CSV generation
└── types/                  # TypeScript types

prisma/
├── schema.prisma           # Database schema
├── migrations/             # Migration files
└── seed.ts                 # Seed data

tests/
├── unit/                   # Vitest unit tests
├── integration/            # API integration tests
└── e2e/                    # Playwright e2e tests

docker/
├── Dockerfile              # App container
├── docker-compose.yml      # Full stack (app + db)
└── docker-compose.prod.yml # Production config
```

**Structure Decision**: Single Next.js application with co-located API routes. This aligns with Simplicity First - no separate backend service needed for 5-10 users. Docker Compose orchestrates the app and PostgreSQL database.

## Complexity Tracking

> No violations - all decisions align with constitution principles.

| Decision | Justification |
|----------|---------------|
| Next.js App Router | Single deployment artifact; built-in API routes eliminate separate backend |
| Prisma ORM | Type-safe queries; auto-generated migrations; no raw SQL complexity |
| shadcn/ui + Tailwind | Copy-paste components; no heavy UI library; consistent styling |
| PostgreSQL | Robust relational DB; handles all query patterns; excellent Docker support |
