# Research: V1 Inventory & BOM Tracker

**Date**: 2025-12-01
**Branch**: `001-inventory-bom-tracker`

## Technology Stack Decisions

### Decision 1: Full-Stack Framework

**Decision**: Next.js 14 with App Router

**Rationale**:
- Single deployment artifact (frontend + API in one container)
- Built-in API routes eliminate need for separate backend service
- Server Components reduce client-side JavaScript for faster initial loads
- Excellent TypeScript support out of the box
- Large ecosystem and community for troubleshooting
- Docker deployment is well-documented

**Alternatives Considered**:
- **Remix**: Similar capabilities but smaller community; Next.js has more enterprise adoption
- **SvelteKit**: Excellent DX but smaller ecosystem for enterprise patterns
- **Separate React + Express**: More complexity to deploy and maintain; overkill for 5-10 users
- **Django/Rails**: Would work well but team familiarity with TypeScript makes JS stack preferable

### Decision 2: Database

**Decision**: PostgreSQL 16

**Rationale**:
- Robust ACID compliance for financial/inventory data integrity
- Excellent support for decimal types (money, quantities)
- JSON columns available if needed for flexible data
- Outstanding Docker support with official images
- Handles all query patterns (filtering, aggregation, joins)
- Free and open source - no licensing concerns for internal deployment

**Alternatives Considered**:
- **SQLite**: Simpler but lacks concurrent write support; risky for multi-user
- **MySQL**: Would work but PostgreSQL has better decimal handling and JSON support
- **MongoDB**: Document model doesn't fit relational inventory/BOM data well

### Decision 3: ORM

**Decision**: Prisma

**Rationale**:
- Type-safe database queries with auto-generated TypeScript types
- Schema-first approach with declarative migrations
- Excellent Next.js integration
- Visual database browser (Prisma Studio) for debugging
- Handles relationships cleanly (important for BOM → BOM Lines → Components)

**Alternatives Considered**:
- **Drizzle**: Lighter weight but less mature migration system
- **TypeORM**: More complex configuration; decorator-based approach less intuitive
- **Raw SQL**: No type safety; more error-prone for complex joins

### Decision 4: UI Components

**Decision**: shadcn/ui + TailwindCSS

**Rationale**:
- Copy-paste components (not a dependency) - full control over code
- Accessible by default (uses Radix UI primitives)
- Consistent, professional appearance out of the box
- Data tables, forms, dialogs all included
- TailwindCSS provides rapid styling without CSS files

**Alternatives Considered**:
- **Material UI**: Heavy bundle size; over-styled for internal tool
- **Chakra UI**: Good but adds runtime dependency; shadcn is lighter
- **Custom CSS**: Time-consuming; inconsistent results

### Decision 5: Authentication

**Decision**: NextAuth.js (Auth.js) with Credentials Provider

**Rationale**:
- Native Next.js integration
- Session-based auth (works without external services)
- Supports database sessions via Prisma adapter
- Role-based access via session data
- No external OAuth providers needed (internal tool)

**Alternatives Considered**:
- **Clerk/Auth0**: External dependency; overkill for internal tool; requires internet
- **Custom JWT**: More implementation work; NextAuth handles edge cases
- **Basic Auth**: Not secure enough; no session management

### Decision 6: Testing

**Decision**: Vitest (unit/integration) + Playwright (e2e)

**Rationale**:
- Vitest: Fast, Jest-compatible API, native ESM support, works with Next.js
- Playwright: Cross-browser e2e tests, excellent async handling, visual debugging
- Both have strong TypeScript support

**Alternatives Considered**:
- **Jest**: Slower than Vitest; ESM configuration issues
- **Cypress**: Heavier than Playwright; less reliable for complex async flows

### Decision 7: Deployment

**Decision**: Docker Compose (app + PostgreSQL)

**Rationale**:
- Single `docker-compose up` starts entire stack
- Isolated from host system dependencies
- Easy to backup (volume mounts)
- Portable across internal servers
- No external cloud services required

**Alternatives Considered**:
- **Kubernetes**: Overkill for 5-10 users; adds operational complexity
- **PM2 + bare PostgreSQL**: Less portable; harder to replicate environments
- **Podman**: Would work but Docker has better tooling/documentation

## Best Practices Applied

### Inventory Management Patterns

1. **Transaction-based quantity tracking**: Never update quantity directly; always through transactions. This ensures audit trail and prevents data inconsistency.

2. **Immutable transaction records**: Transactions are append-only. Corrections create new adjustment transactions rather than modifying existing ones.

3. **Cost snapshots at transaction time**: BOM costs are calculated and stored when a build occurs, preserving historical accuracy even if component costs change later.

4. **Soft deletes for referential integrity**: Components used in BOMs are marked inactive rather than deleted, preserving historical data.

### BOM Management Patterns

1. **Single active BOM per SKU**: Enforced at database level with unique constraint on (sku_id, is_active) where is_active = true.

2. **BOM versioning with effective dates**: Each BOM version has start/end dates for historical tracking.

3. **Dynamic cost calculation**: Unit BOM cost = Σ(component.cost × bom_line.quantity). Calculated on read, not stored (except in transaction snapshots).

### Security Patterns

1. **Server-side session validation**: All API routes check session before processing.

2. **Role-based middleware**: Centralized permission checks based on user role.

3. **Input validation**: Zod schemas for all API inputs; Prisma handles SQL injection prevention.

4. **Audit logging**: Security events (login, failed auth, role changes) logged to database.

## Performance Considerations

### Database Indexes

Key indexes for query performance:
- `components.company_id` + `components.is_active` (list queries)
- `components.sku_code` (unique lookups)
- `transactions.created_at` (date range filters)
- `transactions.component_id` (component history)
- `bom_versions.sku_id` + `bom_versions.is_active` (active BOM lookup)

### Caching Strategy

For V1 scale (5-10 users), no external caching needed:
- Prisma query results are fast enough for tens of thousands of records
- React Query (TanStack Query) for client-side caching and refetching
- Consider Redis only if performance issues arise (unlikely at V1 scale)

### Pagination

- Default page size: 50 items
- Cursor-based pagination for transaction log (better for large datasets)
- Offset pagination acceptable for components/SKUs (smaller datasets)

## Open Questions Resolved

| Question | Resolution |
|----------|------------|
| How to handle decimal quantities? | Use Prisma `Decimal` type backed by PostgreSQL `NUMERIC(10,4)` |
| How to enforce single active BOM? | Database unique partial index + application-level check |
| How to handle concurrent edits? | Optimistic locking via `updatedAt` field comparison |
| CSV import error handling? | Transactional import - rollback entire batch on any row error |
| Session storage? | Database sessions via Prisma adapter (no external Redis) |
