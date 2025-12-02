# Feature Specification: V1 Inventory & BOM Tracker

**Feature Branch**: `001-inventory-bom-tracker`
**Created**: 2025-12-01
**Status**: Draft
**Input**: V1 Inventory and BOM Tracker - Component inventory management, BOM versioning, reorder tracking, and capacity estimation for Tonsil Tech

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Track Component Inventory (Priority: P1)

As an Ops user, I need to track component inventory levels so I can see current stock and know what's available for building sellable SKUs.

**Why this priority**: This is the foundational capability. Without component tracking, nothing else works. It directly replaces the fragile Excel + ChatGPT workflow with a reliable single source of truth.

**Independent Test**: Can be fully tested by adding components, recording receipts, and viewing current quantities. Delivers immediate value as a component inventory database.

**Acceptance Scenarios**:

1. **Given** I am logged in as an Ops user, **When** I create a new component with name, SKU code, cost, reorder point, and lead time, **Then** the component appears in the component list with all fields saved correctly.

2. **Given** a component exists with 0 quantity, **When** I record a receipt of 100 units from a supplier, **Then** the on-hand quantity updates to 100 and a transaction record is created.

3. **Given** a component has 50 units on-hand, **When** I record a manual adjustment of -10 (damaged goods), **Then** the on-hand quantity updates to 40 and an adjustment transaction with reason is logged.

4. **Given** I am viewing the component list, **When** I filter by category or status, **Then** I see only components matching my filter criteria.

---

### User Story 2 - View Reorder Status (Priority: P2)

As an Ops user, I need to see which components need reordering so I can place orders before we run out of critical items.

**Why this priority**: Once inventory is tracked, knowing when to reorder is the next most valuable insight. This prevents stockouts that halt production.

**Independent Test**: Can be tested by setting reorder points and verifying status indicators (Critical/Warning/OK) display correctly based on current quantities.

**Acceptance Scenarios**:

1. **Given** a component has on-hand quantity of 10 and reorder point of 20, **When** I view the component list, **Then** the component shows a "Critical" status indicator (red).

2. **Given** a component has on-hand quantity of 25 and reorder point of 20, **When** I view the component list, **Then** the component shows a "Warning" status indicator (yellow) because it's within 150% of reorder point.

3. **Given** a component has on-hand quantity of 100 and reorder point of 20, **When** I view the component list, **Then** the component shows an "OK" status indicator (green).

4. **Given** I am on the Dashboard, **When** I view the reorder summary, **Then** I see components in Critical and Warning status with their lead times displayed.

---

### User Story 3 - Manage SKUs and BOMs (Priority: P3)

As an Ops user, I need to define sellable SKUs with their bill of materials so I can track what components are needed to build each product.

**Why this priority**: BOMs connect components to sellable products. This is required before we can calculate buildable units or track consumption.

**Independent Test**: Can be tested by creating SKUs, defining BOM versions with component quantities, and verifying BOM cost calculations are correct.

**Acceptance Scenarios**:

1. **Given** I am logged in, **When** I create a new SKU with name, internal code, and sales channel, **Then** the SKU appears in the SKU list.

2. **Given** a SKU exists without a BOM, **When** I create a new BOM version with components and quantities per unit, **Then** the BOM version is saved and marked as active.

3. **Given** components have costs ($2.00, $0.50, $1.00) and a BOM uses 1 of each, **When** I view the BOM version, **Then** the unit BOM cost displays as $3.50.

4. **Given** a SKU has an active BOM version v1, **When** I create BOM version v2 and mark it active, **Then** v1 is automatically marked inactive with an end date and v2 becomes the current active BOM.

5. **Given** I want to make small changes to a BOM, **When** I clone an existing BOM version, **Then** a new version is created with all the same components pre-populated for editing.

---

### User Story 4 - Calculate Buildable Units (Priority: P4)

As an Ops user, I need to see how many units of each SKU I can build with current inventory so I can plan production and fulfillment.

**Why this priority**: Capacity estimation answers "how many can we build?" which is critical for production planning and sales promises.

**Independent Test**: Can be tested by setting up components with known quantities and a BOM, then verifying the max buildable calculation matches expected results.

**Acceptance Scenarios**:

1. **Given** a SKU's BOM requires 1x ComponentA (50 on-hand) and 2x ComponentB (80 on-hand), **When** I view the SKU list, **Then** max buildable units shows 40 (limited by ComponentB: 80÷2=40).

2. **Given** I view a component detail page, **When** I look at related SKUs, **Then** I see which SKUs use this component and how many units of each are constrained by it.

3. **Given** a SKU has an active BOM, **When** I view the Dashboard, **Then** I see top SKUs by buildable quantity for quick capacity overview.

---

### User Story 5 - Record Build/Shipment Transactions (Priority: P5)

As an Ops user, I need to record when I build and ship SKUs so that component inventory is consumed accurately and costs are tracked historically.

**Why this priority**: This completes the inventory loop by deducting components when products are built, maintaining accurate stock levels.

**Independent Test**: Can be tested by recording a build transaction and verifying component quantities decrease correctly and cost snapshots are captured.

**Acceptance Scenarios**:

1. **Given** I select a SKU with an active BOM, **When** I record a build/shipment of 10 units, **Then** all component quantities are reduced according to BOM quantities (e.g., if BOM needs 2x ComponentA per unit, ComponentA decreases by 20).

2. **Given** a build transaction is recorded, **When** I view the transaction details, **Then** I see the unit BOM cost and total BOM cost at the time of the transaction.

3. **Given** a BOM requires 5 units of ComponentA but only 3 are on-hand, **When** I try to record a build of 2 units (requiring 10), **Then** the system warns me of insufficient inventory.

4. **Given** I view the transaction log, **When** I filter by date range, type, component, or SKU, **Then** I see only matching transactions with all relevant details.

---

### User Story 6 - User Authentication and Roles (Priority: P6)

As an Admin, I need to manage user access with appropriate roles so that team members can only perform actions appropriate to their responsibilities.

**Why this priority**: Security is foundational but the system can be developed and tested with a single admin user initially. Role enforcement can be layered on after core functionality.

**Independent Test**: Can be tested by creating users with different roles and verifying each role can only access permitted features.

**Acceptance Scenarios**:

1. **Given** I am not logged in, **When** I try to access any system page, **Then** I am redirected to the login screen.

2. **Given** I am an Admin, **When** I invite a new user with email and role (Admin/Ops/Viewer), **Then** the user can log in with the assigned role.

3. **Given** I am a Viewer, **When** I try to create a component or record a transaction, **Then** I see an error or the action is not available.

4. **Given** I am an Ops user, **When** I try to manage users or system settings, **Then** I see an error or the option is not available.

---

### User Story 7 - Export Data (Priority: P7)

As any user, I need to export data to CSV so I can perform deeper analysis in Excel or share reports with stakeholders.

**Why this priority**: Export is valuable but not blocking for core operations. It provides an escape hatch for analysis the UI doesn't support.

**Independent Test**: Can be tested by exporting each data type and verifying CSV contains all expected columns and accurate data.

**Acceptance Scenarios**:

1. **Given** I am viewing the components list, **When** I click export, **Then** I receive a CSV with all component data including current stock, cost, and status.

2. **Given** I am viewing the SKUs list, **When** I click export, **Then** I receive a CSV with SKU data and current BOM information.

3. **Given** I am viewing the transaction log, **When** I click export, **Then** I receive a CSV with all transaction details including cost snapshots.

---

### Edge Cases

- What happens when a component is used in multiple active BOMs and gets deleted? System prevents deletion of components used in active BOMs.
- How does the system handle fractional quantities in BOMs (e.g., 1/55 of a case pack)? System supports decimal quantities and rounds calculated consumption appropriately.
- What happens when recording a build with insufficient inventory? System warns but allows by default (logging the negative adjustment); Admin can enable strict blocking globally.
- How does the system handle BOM cost calculation when a component has no cost set? System shows "Cost incomplete" warning and excludes that line from total, or shows $0.00 with indicator.
- What happens to historical transactions when a component is deactivated? Transactions remain intact with historical data; component just doesn't appear in active lists.

## Requirements *(mandatory)*

### Functional Requirements

**Component Management**
- **FR-001**: System MUST allow creating components with: name, internal SKU code, category (optional), unit of measure, current cost per unit, reorder point, lead time (days), and notes.
- **FR-002**: System MUST track on-hand quantity for each component, updated through transactions only.
- **FR-003**: System MUST enforce unique component names and SKU codes within the company.
- **FR-004**: System MUST support component status (Active/Inactive) to hide discontinued items without deleting historical data.

**SKU & BOM Management**
- **FR-005**: System MUST allow creating SKUs with: name, internal code, sales channel, external identifiers (optional), and notes.
- **FR-006**: System MUST support multiple BOM versions per SKU with only one active at any time.
- **FR-007**: System MUST require BOM versions to have: version name, effective start date, and at least one component line.
- **FR-008**: System MUST calculate unit BOM cost dynamically from current component costs.
- **FR-009**: System MUST support cloning a BOM version to create a new version with pre-populated data.
- **FR-010**: System MUST automatically set end date on previous active BOM when a new version is activated.

**Inventory Transactions**
- **FR-011**: System MUST support transaction types: Receipt (inbound), Build/Shipment (consumption), and Manual Adjustment.
- **FR-012**: System MUST create immutable transaction records for all inventory changes with timestamp and user attribution.
- **FR-013**: System MUST capture cost snapshots (unit BOM cost, total BOM cost) at build/shipment time.
- **FR-014**: System MUST validate sufficient inventory before build transactions; default behavior is warn-and-allow, with Admin-configurable global setting to enable strict blocking.
- **FR-015**: System MUST allow recording receipts with optional cost update to component default cost.

**Reorder & Capacity**
- **FR-016**: System MUST calculate reorder status (Critical/Warning/OK) based on on-hand quantity vs. reorder point.
- **FR-017**: System MUST calculate max buildable units per SKU from current inventory and active BOM.
- **FR-018**: System MUST display reorder status prominently on component list and dashboard.

**Authentication & Authorization**
- **FR-019**: System MUST require authentication for all access.
- **FR-020**: System MUST support three roles: Admin (full access), Ops (CRUD on inventory/BOMs, no user management), Viewer (read-only).
- **FR-021**: System MUST log security events (login, failed attempts, role changes).

**Reporting & Export**
- **FR-022**: System MUST provide a dashboard with summary tiles for component status and top SKUs by buildable quantity.
- **FR-023**: System MUST support CSV export for components, SKUs/BOMs, and transactions.
- **FR-024**: System MUST provide a filterable transaction log by date range, type, component, SKU, and channel.

**Data Import**
- **FR-027**: System MUST support CSV import for bulk creation of components and SKUs.
- **FR-028**: System MUST provide downloadable CSV templates from the import page with correct column headers and example data.

**Data Integrity**
- **FR-025**: System MUST prevent deletion of components used in active BOMs.
- **FR-026**: System MUST maintain audit trail with created_at/updated_at timestamps and user attribution on all entities.

### Key Entities

- **Company**: The organization using the system. V1 supports single company (Tonsil Tech) but entity exists for future multi-company support.
- **Brand**: A product line within a company (e.g., "Tonsil Tech"). Components and SKUs belong to a brand.
- **Component**: An inventory item that can be stocked and used in BOMs. Has quantity, cost, reorder settings.
- **SKU**: A sellable product configuration, often channel-specific. Has one or more BOM versions.
- **BOM Version**: A specific bill of materials for a SKU, with effective dates and active flag. Contains BOM lines.
- **BOM Line**: A single component and quantity within a BOM version.
- **Transaction**: An immutable record of inventory change (receipt, build, adjustment) with cost snapshots.
- **User**: A person who can access the system, with assigned role determining permissions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can record a component receipt in under 30 seconds from the component list.
- **SC-002**: Users can answer "how many units can we build of SKU X?" in under 5 seconds from the SKU list or dashboard.
- **SC-003**: Users can identify all components needing reorder within 10 seconds from the dashboard.
- **SC-004**: 100% of inventory mutations create transaction records (no data changes without audit trail).
- **SC-005**: Historical BOM costs are preserved - users can view the exact cost of any past build transaction.
- **SC-006**: System supports at least 10 concurrent users without noticeable slowdown.
- **SC-007**: All primary workflows (add component, record transaction, view buildable units) are completable by non-technical ops staff without training documentation.
- **SC-008**: Data export produces valid CSV files that open correctly in Excel with all columns and rows intact.
- **SC-009**: Unauthorized users cannot access protected resources or perform restricted actions (role enforcement is complete).
- **SC-010**: System eliminates reliance on Excel spreadsheets for daily inventory operations within first week of deployment.

## Clarifications

### Session 2025-12-01

- Q: How will users bootstrap the system with existing data from Excel? → A: Manual entry + CSV import with downloadable template available from import page
- Q: How should the system handle builds with insufficient inventory? → A: Warn but allow by default; Admin can enable strict blocking globally if it becomes a problem
- Q: How should the system handle currency? → A: Single currency (USD assumed), no currency field needed

## Assumptions

- V1 is for Tonsil Tech only; single company, single location
- All costs are in USD; no multi-currency support in V1
- All data entry is manual; no external integrations
- 5-10 users maximum for V1
- Tens of thousands of transactions is the expected upper bound
- Warning threshold is 150% of reorder point (configurable in future)
- Standard web session-based authentication is acceptable
- Users have modern web browsers (no IE11 support needed)
- Deployment is to internal corporate network server (no external cloud platforms like Vercel)
- Docker-based deployment for self-contained, portable installation
