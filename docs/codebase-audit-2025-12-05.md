# Codebase Audit: Architectural & Implementation Issues
**Date:** December 5, 2025
**Scope:** V1 Release - Tonsil Tech Inventory

This document outlines technical debt, architectural flaws, and implementation risks identified during the codebase review. These items are distinct from immediate bugs (which have been filed as GitHub issues) and represent deeper structural improvements needed for long-term maintainability.

---

## ⚠️ Features Implemented Poorly
*Refactoring required to improve stability and maintainability.*

### 1. Inventory Calculation via Aggregation
**Location:** `src/services/inventory.ts` (`getComponentQuantities`)

*   **The Issue:** The system calculates inventory on-the-fly by summing `TransactionLine` entries. The logic is duplicated and split between a "Global" path (simple sum) and a "Location-Specific" path (complex conditional logic to handle Transfers).
*   **Why it's poor:**
    *   **Fragility:** Transfer logic depends on hardcoded assumptions (negative vs. positive lines, specific filters). If transaction types evolve, this calculation breaks easily.
    *   **Performance:** Aggregating the entire transaction history for every inventory view is O(N) and will degrade as data grows.
    *   **Inconsistency:** The split logic invites off-by-one errors where global totals don't match the sum of location totals.
*   **Recommendation:** Refactor to use a snapshot-based approach (e.g., `InventoryBalance` table) or consolidate the logic into a single, robust SQL/Prisma query that handles all transaction types uniformly.

### 2. Shopify Integration Scope Creep
**Location:** `src/services/shopify.ts`, `prisma/schema.prisma`

*   **The Issue:** The PRD explicitly lists "No integrations" as a Non-Goal for V1. However, the codebase contains extensive "dead" code for Shopify (Entities, Services, Sync logic) that is partially implemented but not active.
*   **Why it's poor:**
    *   **Maintenance Burden:** Developers must maintain schema fields and service files that aren't being used.
    *   **Security Risk:** Unused API endpoints or service methods increase the attack surface (e.g., potential for unauthenticated access to "hidden" features).
    *   **Cognitive Load:** New developers are confused by the presence of "Shopify" code in a V1 manual-entry system.
*   **Recommendation:** Comment out or remove the Shopify-related schema and services until V2 work officially begins.

---

## 🏗️ Features Designed Poorly
*Architectural decisions that complicate the system or introduce risk.*

### 1. Implicit Multi-Tenancy (Service Layer)
**Location:** All Service Methods (e.g., `inventory.ts`, `bom.ts`)

*   **The Issue:** Service methods typically accept an ID (e.g., `componentId`) without requiring or validating a `companyId`. They rely entirely on the API layer (Controllers) to check ownership before calling the service.
*   **Why it's poor:**
    *   **Violation of "Defense in Depth":** If a controller misses a check, the service happily returns data belonging to another tenant (as seen in Bug #191).
    *   **Refactoring Risk:** Future calls to these services from background jobs or other internal tools might accidentally cross tenant boundaries.
*   **Recommendation:** Update **all** service signatures to require `companyId` as a mandatory parameter and enforce `where: { companyId }` in every database query.

### 2. Single Active BOM Enforcement (Application-Side Only)
**Location:** `src/services/bom.ts`, Database Schema

*   **The Issue:** The rule "One Active BOM per SKU" is enforced only by application code (deactivating old versions during update). The database lacks a unique constraint.
*   **Why it's poor:**
    *   **Data Integrity Risk:** A race condition, manual DB edit, or logic bug could result in two BOMs being active simultaneously.
    *   **Indeterminism:** Functions like `calculateMaxBuildableUnits` use `findFirst` to get the active BOM. If multiple are active, the system might randomly pick different versions, causing fluctuating inventory numbers.
*   **Recommendation:** Add a PostgreSQL partial unique index: `CREATE UNIQUE INDEX "one_active_bom_per_sku" ON "BOMVersion"("skuId") WHERE "isActive" = true;`.

### 3. Over-Engineered Location Support for V1
**Location:** Database Schema (`Location`, `Transfer`), `inventory.ts`

*   **The Issue:** V1 requirements specify a simple "Single Facility" model. The architecture implements full Multi-Location support (Transfers, Default Locations, explicit `locationId` on everything).
*   **Why it's poor:**
    *   **Unnecessary Complexity:** Every inventory query must handle `locationId` (checking for nulls/defaults).
    *   **User Confusion:** The UI has to hide this complexity, but the backend is forced to manage it.
    *   **Premature Optimization:** The implementation of Transfers (as split transaction lines) is complex and might not even match the actual V2 requirements when they are fully defined.
*   **Recommendation:** For V1, consider treating `locationId` as a hidden constant or simplifying the query layer to ignore it until V2, reducing the risk of bugs in the "Global vs. Location" aggregation logic.
