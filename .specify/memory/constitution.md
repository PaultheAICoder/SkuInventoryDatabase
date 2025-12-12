<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 2.0.0 (MAJOR - V2 scope expansion)

Modified sections:
- Additional Constraints > Technology & Integration: Updated for V2 external integrations
- Additional Constraints > Out of Scope: Updated to reflect V2 scope
- Added V2 Scope section documenting new capabilities

Rationale: V1 core inventory system is complete. V2 adds external integrations
(Amazon Ads, Shopify) as documented in PRD-sales-ads-seo.md.

Templates requiring updates: None (existing templates compatible)

Follow-up TODOs: None
==================
-->

# Trevor Inventory Constitution

## Core Principles

### I. Data Integrity & Auditability

Every inventory change MUST be captured as an immutable transaction record. The system
serves as the single source of truth for component inventory, BOM configurations, and
cost history.

**Non-negotiable rules:**
- All inventory mutations (receipts, builds, adjustments) MUST create transaction records
- Transaction records MUST NOT be deleted or modified after creation
- Cost snapshots MUST be captured at transaction time for historical accuracy
- Every entity MUST have created_at/updated_at timestamps and user attribution

**Rationale:** Trevor's team needs reliable historical data for cost analysis, BOM
version comparison, and inventory reconciliation. The current Excel + ChatGPT workflow
fails precisely because state is not properly tracked.

### II. Simplicity First

Start with the simplest solution that meets V1 requirements. Avoid abstractions,
patterns, or features that serve hypothetical future needs rather than current,
documented requirements.

**Non-negotiable rules:**
- MUST NOT implement features explicitly listed as "Non-Goals" in the PRD
- MUST NOT add configuration options unless the PRD specifies variability
- Code SHOULD be obvious to read; prefer explicit over clever
- Database schema SHOULD be normalized but MUST NOT over-engineer for unknown futures
- UI MUST be non-cluttered and accessible to non-technical ops staff

**Rationale:** V1 is an internal tool for 5-10 users replacing spreadsheets. Over-
engineering increases development time, maintenance burden, and user confusion without
delivering proportional value.

### III. Extensibility by Design

While keeping V1 simple, data models and architecture MUST accommodate documented
future phases (V2: multi-location, Shopify integration; V3: lot tracking, multi-brand)
without requiring data migration or schema redesign.

**Non-negotiable rules:**
- Company/Brand entities MUST exist in the data model even if V1 UI hides them
- Foreign keys and relationships MUST be designed to support future entities (locations,
  lots) even if those tables don't exist yet
- API endpoints SHOULD accept optional parameters that V1 ignores but V2/V3 will use
- Configuration SHOULD be per-company/brand even if V1 has only one

**Rationale:** The PRD explicitly states the design must support Mela Vitamins and
future brands. Proper entity modeling now prevents costly migrations later.

### IV. Security & Authorization

The system MUST implement proper authentication and role-based access control from day
one, even though V1's user base is small and trusted.

**Non-negotiable rules:**
- All endpoints MUST require authentication
- Role checks (Admin/Ops/Viewer) MUST be enforced at the API layer
- Passwords MUST be properly hashed; sessions MUST be secure
- All data MUST be encrypted in transit (HTTPS) and at rest
- Security events (login, role changes, failed attempts) MUST be logged

**Rationale:** Inventory and cost data are business-sensitive. Adding security
retroactively is harder than building it in. The PRD lists security as a non-functional
requirement.

### V. User-Centric Design

Every feature MUST serve a documented user need from the PRD. UI decisions SHOULD
prioritize the daily workflow of ops staff over administrative convenience.

**Non-negotiable rules:**
- Primary views (Dashboard, Components, SKUs) MUST surface actionable information first
- Reorder status (Critical/Warning/OK) MUST be immediately visible without navigation
- "Max buildable units" MUST be calculable and displayed for capacity planning
- CSV export MUST be available for components, SKUs, and transactions
- Error messages MUST be understandable by non-technical users

**Rationale:** The system replaces a manual process. If users can't quickly answer
"what do I need to reorder?" and "how many units can we build?", the tool has failed.

## Additional Constraints

### Technology & Integration

- Tech stack is implementer's choice but MUST support web frontend + API backend
- Performance targets: UI operations feel instant for current scale (tens of thousands of
  transactions)
- External integrations MUST use OAuth2 where available
- API credentials MUST be encrypted at rest

### Data Model Boundaries

- Single location only (no FBA vs warehouse tracking)
- Components only (no finished goods inventory state)
- Pooled inventory (no lot/expiry tracking)
- One active BOM version per SKU at any time

### V2 Scope (Current)

These capabilities are now in scope as of V2:
- Amazon Ads API integration (read-only, US marketplace)
- Shopify integration (read-only order/product sync)
- CSV upload for keyword data (Amazon, ZonGuru, Helium10)
- In-app notifications for sync failures
- ASIN-to-SKU mapping for cross-system data correlation
- Daily sales breakdown with organic/ad attribution

### Out of Scope (V2)

These remain prohibited in V2 implementation:
- Multi-location inventory tracking
- Finished goods / WIP bin tracking
- Lot numbers and expiry dates
- Email/Slack notifications (in-app only for now)
- Demand forecasting
- Write-back to external platforms (read-only integrations only)
- Google Ads or other advertising platforms beyond Amazon

## Development Workflow

### Code Review Requirements

All pull requests SHOULD be reviewed against this constitution. Reviewers SHOULD flag:
- Features that violate "Out of Scope" constraints
- Over-engineering that conflicts with Simplicity First
- Missing audit trails for inventory mutations
- Security gaps or missing authorization checks

### Quality Gates

Before merging, code SHOULD pass:
- Automated tests covering core business logic
- Manual verification of audit trail completeness
- Security review for authentication/authorization code

### Documentation

- API endpoints SHOULD be documented with request/response examples
- Database schema changes MUST include migration scripts
- User-facing features SHOULD include brief usage notes

## Governance

This constitution provides advisory guidance for the Trevor Inventory project. It
documents the principles derived from the PRD and serves as a reference for design
decisions.

**Amendment Process:**
1. Propose changes via pull request to this document
2. Document rationale for principle additions, modifications, or removals
3. Update version number according to semantic versioning
4. Ensure dependent templates remain consistent

**Compliance Approach:**
- Violations SHOULD be flagged in code review with reference to specific principle
- Deviations SHOULD be justified in PR description or code comments
- Team discretion is allowed when principles conflict; document the trade-off

**Version Policy:**
- MAJOR: Principle removal or fundamental redefinition
- MINOR: New principle added or significant guidance expansion
- PATCH: Clarifications, wording improvements, typo fixes

**Version**: 2.0.0 | **Ratified**: 2025-12-01 | **Last Amended**: 2025-12-12
