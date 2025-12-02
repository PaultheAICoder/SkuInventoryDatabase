# Tasks: V1 Inventory & BOM Tracker

**Input**: Design documents from `/specs/001-inventory-bom-tracker/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-overview.md, quickstart.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure) ✅ COMPLETE

**Purpose**: Project initialization and Next.js 14 + Prisma + NextAuth foundation

- [x] T001 Initialize Next.js 14 project with TypeScript and App Router in repository root
- [x] T002 Configure TailwindCSS and PostCSS in tailwind.config.ts and postcss.config.js
- [x] T003 [P] Install and configure shadcn/ui with components.json
- [x] T004 [P] Configure ESLint and Prettier with .eslintrc.json and .prettierrc
- [x] T005 [P] Create environment configuration with .env.example and src/lib/env.ts validation
- [x] T006 Create Docker development configuration in docker/docker-compose.yml (PostgreSQL 16)
- [x] T007 [P] Create Docker production configuration in docker/docker-compose.prod.yml
- [x] T008 [P] Create Dockerfile for Next.js application in docker/Dockerfile

---

## Phase 2: Foundational (Blocking Prerequisites) ✅ COMPLETE

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T009 Initialize Prisma with PostgreSQL provider in prisma/schema.prisma
- [x] T010 Create Company entity in prisma/schema.prisma with id, name, settings, timestamps
- [x] T011 Create Brand entity in prisma/schema.prisma with companyId FK, name, isActive, timestamps
- [x] T012 Create User entity in prisma/schema.prisma with companyId FK, email, passwordHash, name, role enum, isActive, timestamps
- [x] T013 Create SecurityEvent entity in prisma/schema.prisma for audit logging
- [x] T014 Run initial Prisma migration with npx prisma migrate dev --name "init" (NOTE: Schema defined, migration pending DB)
- [x] T015 Create Prisma client singleton in src/lib/db.ts
- [x] T016 Configure NextAuth.js with Credentials provider in src/lib/auth.ts
- [x] T017 Create NextAuth API route in src/app/api/auth/[...nextauth]/route.ts
- [x] T018 [P] Create login page UI in src/app/(auth)/login/page.tsx
- [x] T019 Create role-based middleware in src/middleware.ts for route protection
- [x] T020 [P] Create base layout with navigation in src/app/(dashboard)/layout.tsx
- [x] T021 [P] Create shared UI components: Button, Input, Card, Table, Dialog in src/components/ui/
- [x] T022 [P] Create common types and Zod schemas in src/types/index.ts
- [x] T023 Create API response helpers in src/lib/api-response.ts for consistent error/success formats
- [x] T024 Create database seed script with Company, Brand, Admin user in prisma/seed.ts
- [x] T025 Configure Prisma seed command in package.json and run initial seed

**Checkpoint**: Foundation ready - authentication works, database connected, user story implementation can begin

---

## Phase 3: User Story 1 - Track Component Inventory (Priority: P1) 🎯 MVP ✅ COMPLETE

**Goal**: Allow Ops users to create components, record receipts/adjustments, and view current stock levels

**Independent Test**: Create components, record receipts, verify quantity updates and transaction history

### Implementation for User Story 1

- [x] T026 [P] [US1] Create Component entity in prisma/schema.prisma with all fields from data-model.md
- [x] T027 [P] [US1] Create Transaction entity in prisma/schema.prisma with type enum, cost snapshots, audit fields
- [x] T028 [P] [US1] Create TransactionLine entity in prisma/schema.prisma with componentId FK, quantityChange, costPerUnit
- [x] T029 [US1] Run Prisma migration for Component and Transaction entities (schema defined, migration pending DB)
- [x] T030 [P] [US1] Create Component Zod validation schemas in src/types/component.ts
- [x] T031 [P] [US1] Create Transaction Zod validation schemas in src/types/transaction.ts
- [x] T032 [US1] Implement inventory service with quantity calculation in src/services/inventory.ts
- [x] T033 [US1] Implement component CRUD API route GET/POST in src/app/api/components/route.ts
- [x] T034 [US1] Implement component detail API route GET/PATCH/DELETE in src/app/api/components/[id]/route.ts
- [x] T035 [US1] Implement receipt transaction API route POST in src/app/api/transactions/receipt/route.ts
- [x] T036 [US1] Implement adjustment transaction API route POST in src/app/api/transactions/adjustment/route.ts
- [x] T037 [US1] Implement transaction list API route GET in src/app/api/transactions/route.ts
- [x] T038 [P] [US1] Create ComponentForm component in src/components/features/ComponentForm.tsx
- [x] T039 [P] [US1] Create ComponentTable component with sorting/filtering in src/components/features/ComponentTable.tsx
- [x] T040 [P] [US1] Create ReceiptDialog component in src/components/features/ReceiptDialog.tsx
- [x] T041 [P] [US1] Create AdjustmentDialog component in src/components/features/AdjustmentDialog.tsx
- [x] T042 [US1] Create component list page in src/app/(dashboard)/components/page.tsx
- [x] T043 [US1] Create component detail page in src/app/(dashboard)/components/[id]/page.tsx
- [x] T044 [US1] Create new component page in src/app/(dashboard)/components/new/page.tsx
- [x] T045 [US1] Create transaction log page in src/app/(dashboard)/transactions/page.tsx

**Checkpoint**: User Story 1 complete - can add components, record receipts/adjustments, view stock levels and transaction history

---

## Phase 4: User Story 2 - View Reorder Status (Priority: P2) ✅ COMPLETE

**Goal**: Display Critical/Warning/OK status indicators and reorder summary on dashboard

**Independent Test**: Set reorder points, verify status indicators display correctly based on quantity vs threshold

### Implementation for User Story 2

- [x] T046 [US2] Implement reorder status calculation in src/services/inventory.ts (critical/warning/ok thresholds)
- [x] T047 [US2] Add reorderStatus computed field to component list API response in src/app/api/components/route.ts
- [x] T048 [US2] Implement dashboard API route with component stats in src/app/api/dashboard/route.ts
- [x] T049 [P] [US2] Create ReorderStatusBadge component in src/components/features/ReorderStatusBadge.tsx
- [x] T050 [P] [US2] Create DashboardStats component in src/components/features/DashboardStats.tsx
- [x] T051 [P] [US2] Create CriticalComponentsList component in src/components/features/CriticalComponentsList.tsx
- [x] T052 [US2] Update ComponentTable to display reorder status badges in src/components/features/ComponentTable.tsx
- [x] T053 [US2] Create dashboard home page with reorder summary in src/app/(dashboard)/page.tsx

**Checkpoint**: User Story 2 complete - reorder status visible on component list and dashboard

---

## Phase 5: User Story 3 - Manage SKUs and BOMs (Priority: P3) ✅ COMPLETE

**Goal**: Create SKUs, define BOM versions with component quantities, calculate BOM cost, support versioning

**Independent Test**: Create SKUs, add BOM versions with components, verify cost calculations, test version cloning

### Implementation for User Story 3

- [x] T054 [P] [US3] Create SKU entity in prisma/schema.prisma with all fields from data-model.md
- [x] T055 [P] [US3] Create BOMVersion entity in prisma/schema.prisma with unique partial index for single active BOM
- [x] T056 [P] [US3] Create BOMLine entity in prisma/schema.prisma with componentId FK, quantityPerUnit
- [x] T057 [US3] Run Prisma migration for SKU, BOMVersion, BOMLine entities
- [x] T058 [P] [US3] Create SKU Zod validation schemas in src/types/sku.ts
- [x] T059 [P] [US3] Create BOMVersion Zod validation schemas in src/types/bom.ts
- [x] T060 [US3] Implement BOM cost calculation service in src/services/bom.ts
- [x] T061 [US3] Implement SKU CRUD API route GET/POST in src/app/api/skus/route.ts
- [x] T062 [US3] Implement SKU detail API route GET/PATCH/DELETE in src/app/api/skus/[id]/route.ts
- [x] T063 [US3] Implement BOM versions list API route GET/POST in src/app/api/skus/[id]/bom-versions/route.ts
- [x] T064 [US3] Implement BOM version detail API route GET in src/app/api/bom-versions/[id]/route.ts
- [x] T065 [US3] Implement BOM version clone API route POST in src/app/api/bom-versions/[id]/clone/route.ts
- [x] T066 [US3] Implement BOM version activate API route POST in src/app/api/bom-versions/[id]/activate/route.ts
- [x] T067 [P] [US3] Create SKUForm component in src/components/features/SKUForm.tsx
- [x] T068 [P] [US3] Create SKUTable component in src/components/features/SKUTable.tsx
- [x] T069 [P] [US3] Create BOMVersionForm component with component line editor in src/components/features/BOMVersionForm.tsx
- [x] T070 [P] [US3] Create BOMVersionList component in src/components/features/BOMVersionList.tsx
- [x] T071 [US3] Create SKU list page in src/app/(dashboard)/skus/page.tsx
- [x] T072 [US3] Create SKU detail page with BOM management in src/app/(dashboard)/skus/[id]/page.tsx
- [x] T073 [US3] Create new SKU page in src/app/(dashboard)/skus/new/page.tsx

**Checkpoint**: User Story 3 complete - SKUs and BOMs fully manageable with versioning and cost calculations

---

## Phase 6: User Story 4 - Calculate Buildable Units (Priority: P4)

**Goal**: Display max buildable units per SKU based on current inventory and active BOM

**Independent Test**: Set up components with known quantities and a BOM, verify buildable calculation matches expected

### Implementation for User Story 4

- [x] T074 [US4] Implement maxBuildableUnits calculation in src/services/bom.ts (moved to bom.ts)
- [x] T075 [US4] Add maxBuildableUnits computed field to SKU list API response in src/app/api/skus/route.ts
- [x] T076 [US4] Add component-constrained SKUs to component detail API in src/app/api/components/[id]/route.ts
- [x] T077 [US4] Add topBuildableSkus to dashboard API in src/app/api/dashboard/route.ts
- [x] T078 [P] [US4] Create BuildableUnitsDisplay component in src/components/features/BuildableUnitsDisplay.tsx
- [x] T079 [P] [US4] Create TopBuildableSkusList component in src/components/features/TopBuildableSkusList.tsx
- [x] T080 [US4] Update SKUTable to display buildable units in src/components/features/SKUTable.tsx
- [x] T081 [US4] Update dashboard to show top buildable SKUs in src/app/(dashboard)/page.tsx
- [x] T082 [US4] Update component detail to show constrained SKUs in src/app/(dashboard)/components/[id]/page.tsx

**Checkpoint**: User Story 4 complete - buildable units visible on SKU list, dashboard, and component detail

---

## Phase 7: User Story 5 - Record Build/Shipment Transactions (Priority: P5)

**Goal**: Record build transactions that consume components per BOM, capture cost snapshots, warn on insufficient inventory

**Independent Test**: Record build transaction, verify component quantities decrease correctly, confirm cost snapshot saved

### Implementation for User Story 5

- [x] T083 [US5] Implement build transaction with BOM consumption in src/services/inventory.ts
- [x] T084 [US5] Add insufficient inventory check with configurable blocking in src/services/inventory.ts
- [x] T085 [US5] Implement build transaction API route POST in src/app/api/transactions/build/route.ts
- [x] T086 [US5] Implement transaction detail API route GET in src/app/api/transactions/[id]/route.ts
- [x] T087 [P] [US5] Create BuildDialog component with SKU selector in src/components/features/BuildDialog.tsx
- [x] T088 [P] [US5] Create TransactionDetail component with cost breakdown in src/components/features/TransactionDetail.tsx
- [x] T089 [P] [US5] Create InsufficientInventoryWarning component in src/components/features/InsufficientInventoryWarning.tsx
- [x] T090 [US5] Update SKU detail page with build action in src/app/(dashboard)/skus/[id]/page.tsx
- [x] T091 [US5] Create transaction detail page in src/app/(dashboard)/transactions/[id]/page.tsx
- [x] T092 [US5] Add transaction filtering by type, component, SKU, date range in src/app/(dashboard)/transactions/page.tsx

**Checkpoint**: User Story 5 complete - build transactions work with BOM consumption, cost snapshots preserved

---

## Phase 8: User Story 6 - User Authentication and Roles (Priority: P6)

**Goal**: Multi-user support with Admin/Ops/Viewer roles and appropriate access control

**Independent Test**: Create users with different roles, verify each role can only access permitted features

### Implementation for User Story 6

- [ ] T093 [US6] Enhance role-based middleware with granular permissions in src/middleware.ts
- [ ] T094 [US6] Create role permission utilities in src/lib/permissions.ts
- [ ] T095 [US6] Implement users CRUD API route GET/POST (Admin only) in src/app/api/users/route.ts
- [ ] T096 [US6] Implement user detail API route GET/PATCH/DELETE in src/app/api/users/[id]/route.ts
- [ ] T097 [US6] Implement settings API route GET/PATCH (Admin only) in src/app/api/settings/route.ts
- [ ] T098 [US6] Add security event logging for login/logout/role changes in src/lib/auth.ts
- [ ] T099 [P] [US6] Create UserForm component in src/components/features/UserForm.tsx
- [ ] T100 [P] [US6] Create UserTable component in src/components/features/UserTable.tsx
- [ ] T101 [P] [US6] Create SettingsForm component in src/components/features/SettingsForm.tsx
- [ ] T102 [US6] Create user management page (Admin only) in src/app/(dashboard)/settings/users/page.tsx
- [ ] T103 [US6] Create settings page (Admin only) in src/app/(dashboard)/settings/page.tsx
- [ ] T104 [US6] Add role-based UI element hiding throughout all dashboard pages

**Checkpoint**: User Story 6 complete - multi-user with role-based access working

---

## Phase 9: User Story 7 - Export Data (Priority: P7)

**Goal**: Export components, SKUs, and transactions to CSV files

**Independent Test**: Export each data type, verify CSV opens correctly in Excel with accurate data

### Implementation for User Story 7

- [ ] T105 [US7] Implement CSV export service in src/services/export.ts
- [ ] T106 [US7] Implement component export API route GET in src/app/api/export/components/route.ts
- [ ] T107 [US7] Implement SKU export API route GET in src/app/api/export/skus/route.ts
- [ ] T108 [US7] Implement transaction export API route GET in src/app/api/export/transactions/route.ts
- [ ] T109 [P] [US7] Create ExportButton component in src/components/features/ExportButton.tsx
- [ ] T110 [US7] Add export button to component list page in src/app/(dashboard)/components/page.tsx
- [ ] T111 [US7] Add export button to SKU list page in src/app/(dashboard)/skus/page.tsx
- [ ] T112 [US7] Add export button to transaction log page in src/app/(dashboard)/transactions/page.tsx

**Checkpoint**: User Story 7 complete - CSV exports working for all data types

---

## Phase 10: CSV Import (FR-027, FR-028)

**Goal**: Support bulk import of components and SKUs via CSV with downloadable templates

**Independent Test**: Download template, fill with sample data, import and verify records created correctly

### Implementation for CSV Import

- [ ] T113 Implement CSV import service with validation in src/services/import.ts
- [ ] T114 Implement import template download API route GET in src/app/api/import/template/[type]/route.ts
- [ ] T115 Implement component import API route POST in src/app/api/import/components/route.ts
- [ ] T116 Implement SKU import API route POST in src/app/api/import/skus/route.ts
- [ ] T117 [P] Create ImportForm component with file upload in src/components/features/ImportForm.tsx
- [ ] T118 [P] Create ImportResultDialog component in src/components/features/ImportResultDialog.tsx
- [ ] T119 Create import page in src/app/(dashboard)/import/page.tsx

**Checkpoint**: CSV import working with templates and error handling

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final improvements and deployment readiness

- [ ] T120 Add loading states and skeletons to all data-fetching pages
- [ ] T121 Add error boundaries with user-friendly error pages in src/app/error.tsx
- [ ] T122 Add not-found page in src/app/not-found.tsx
- [ ] T123 Add toast notifications for CRUD operations throughout app
- [ ] T124 Implement optimistic UI updates for transaction recording
- [ ] T125 Add keyboard shortcuts for common actions
- [ ] T126 Review and add database indexes per research.md recommendations
- [ ] T127 Security review: verify all API routes check authentication and authorization
- [ ] T128 Update prisma/seed.ts with realistic sample data for demo
- [ ] T129 Validate quickstart.md instructions work end-to-end
- [ ] T130 Final lint and type-check: npm run lint && npm run build

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phases 3-9)**: All depend on Foundational phase completion
  - Stories can proceed in priority order (P1 → P2 → P3 → P4 → P5 → P6 → P7)
  - Some parallelization possible with multiple developers
- **CSV Import (Phase 10)**: Can run after Phase 3 (needs component/SKU entities)
- **Polish (Phase 11)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: No dependencies on other stories - foundation only
- **User Story 2 (P2)**: Builds on US1 (needs components with quantities)
- **User Story 3 (P3)**: Builds on US1 (needs components for BOM lines)
- **User Story 4 (P4)**: Builds on US1 + US3 (needs components + BOMs)
- **User Story 5 (P5)**: Builds on US1 + US3 + US4 (needs BOMs + buildable calculations)
- **User Story 6 (P6)**: Can run after Foundation (Phase 2) - enhances existing auth
- **User Story 7 (P7)**: Can run after US1 + US3 (needs data to export)

### Parallel Opportunities

- Phase 1: T003, T004, T005, T007, T008 can run in parallel
- Phase 2: T018, T020, T021, T022 can run in parallel
- Each User Story: Tests and models marked [P] can run in parallel
- Different user stories can be worked on in parallel by different developers after Foundation

---

## Parallel Example: User Story 1

```bash
# Launch all models in parallel:
Task: "Create Component entity in prisma/schema.prisma"
Task: "Create Transaction entity in prisma/schema.prisma"
Task: "Create TransactionLine entity in prisma/schema.prisma"

# After migration, launch validation schemas in parallel:
Task: "Create Component Zod validation schemas in src/types/component.ts"
Task: "Create Transaction Zod validation schemas in src/types/transaction.ts"

# Launch all UI components in parallel:
Task: "Create ComponentForm component in src/components/features/ComponentForm.tsx"
Task: "Create ComponentTable component in src/components/features/ComponentTable.tsx"
Task: "Create ReceiptDialog component in src/components/features/ReceiptDialog.tsx"
Task: "Create AdjustmentDialog component in src/components/features/AdjustmentDialog.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Track Component Inventory)
4. **STOP and VALIDATE**: Test component CRUD, receipts, adjustments
5. Deploy/demo if ready - users can immediately start tracking inventory

### Incremental Delivery

1. **Foundation** → Project setup and authentication working
2. **+ US1** → Component inventory tracking (MVP! Replaces Excel)
3. **+ US2** → Reorder status visibility (prevents stockouts)
4. **+ US3** → SKU and BOM management (enables product tracking)
5. **+ US4** → Buildable units calculation (capacity planning)
6. **+ US5** → Build transactions (complete inventory loop)
7. **+ US6** → Multi-user with roles (team access)
8. **+ US7 + Import** → Data portability (CSV import/export)
9. **Polish** → Production-ready

### Suggested MVP Scope

**Minimum**: Complete through Phase 3 (User Story 1)
- Users can track component inventory with receipts and adjustments
- Immediate value: replaces fragile Excel + ChatGPT workflow

**Recommended**: Complete through Phase 5 (User Story 3)
- Full component and SKU/BOM management
- Cost calculations working
- Foundation for all remaining features

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- All file paths assume repository root as working directory
