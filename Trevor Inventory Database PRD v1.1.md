Here’s my understanding now, rolled up before I jump into the PRD:

* Product is an **internal inventory \+ BOM \+ costing tool** for **Tonsil Tech** (v1), with architecture ready for **Mela Vitamins** and a future **hangover recovery kit** later.

* **V1** \= single facility, manual data entry only, pooled inventory (no locations, no lots/expiry), track **components → SKUs via BOMs**, with **BOM versioning** and **reorder flags \+ buildable-units view**.

* **V2** \= locations \+ “finished goods” tracking \+ Shopify integration \+ email alerts.

* **V3** \= lot numbers, expiry, recall tracing, deeper forecasting/analytics, multi-brand rollout.

## **1\. Product Overview**

**Product name (working):** Tonsil Tech Inventory & BOM Tracker (internal tool)  
 **Version:** V1 (Tonsil Tech only)  
 **Primary stakeholders:**

* Trevor – owner/operator for Tonsil Tech and other brands

* Execs – need visibility into inventory, costs, risk

* Ops / SKU-building team (5–10 users total)

**High-level problem:**  
 Current workflow is a fragile mix of Excel \+ ChatGPT, with manual uploads, poor statefulness, and no shared portal. The team needs a reliable system to:

* Track **component inventory** (wrist straps, tools, boxes, case packs, mailers, etc.)

* Map components to **sellable SKUs** via **BOMs** (single \+ 3-pack, etc.)

* Quickly see **how many units** of each SKU they *could* build now

* Know **when to reorder components**, given lead times

* Track **BOM changes over time** and their impact on unit cost

V1 is for **Tonsil Tech only**, but the design must clearly support future brands and more complex requirements.

---

## **2\. Goals & Non‑Goals (V1)**

### **Goals**

1. **Single source of truth for component inventory**

   * Manual in/out tracking of components, replacing spreadsheets.

2. **Accurate BOM representation with versioning**

   * Each SKU has BOM versions; one active at a time.

   * Ability to see historical configurations and unit costs.

3. **Simple, actionable reorder view**

   * Per-component reorder point \+ lead time \+ status indicator.

4. **Capacity estimation**

   * For each SKU, show **“max units you can build”** from current inventory.

5. **Cost awareness**

   * Compute **BOM unit cost** from component costs.

   * Record cost per unit at time of build/shipment using BOM active then.

### **Non‑Goals (explicitly out of scope for V1)**

* **No integrations** (Shopify, Amazon, TikTok, Walmart, etc.). All data entry is manual.

* **No multi-location stock** (FBA vs warehouse vs 3PL, etc.).

* **No finished goods/WIP bin** (just components and consumption).

* **No lot/expiry tracking or recall tooling** (planned for \~V3).

* **No automated notifications** (email/Slack) – V1 is visual/UI only.

* **No marketing / ROAS analytics or demand forecasting** – future phase.

---

## **3\. Users & Roles (V1)**

V1 can be simple, but we’ll design so roles are extensible.

**User types (V1):**

1. **Admin**

   * Typically Trevor / designated exec.

   * Full CRUD on all entities (companies, components, SKUs, BOMs, users).

   * Can set permissions, change system configuration.

2. **Ops / SKU Builder**

   * Day-to-day inventory \+ production users.

   * Can create and edit **transactions**, **components**, and **SKUs/BOMs**.

   * Cannot manage users or system-level settings.

3. **Viewer (optional in V1)**

   * Read-only access for execs who just want dashboards/exports.

If you prefer, in V1 everyone can be “Admin/Ops” and we only enforce read-only vs full-access; the model supports finer roles later.

---

## **4\. Core Concepts & Entities**

### **4.1 Company / Brand (for extensibility)**

* **Company**

  * Example: “Tonsil Tech LLC”.

  * V1: limit to a single company but modeled explicitly in DB.

  * Future: can host Mela, hangover kit, other brands in same app.

* **Brand** (optional in V1, but nice to have)

  * Example: “Tonsil Tech”, “Mela Vitamins”.

  * SKUs and components link to a brand.

For V1 UI we can largely hide multi-company/brand; the DB just has fields ready.

### **4.2 Components**

A **component** is any item that can be stocked and used in BOMs:

Examples (Tonsil Tech):

* Medium tool

* Small tool

* Large tool

* Wrist strap

* Product box (single / three-pack)

* Travel case

* Bubble mailer

* Case pack

* Avery label

* IFU (instructions for use) – single and 3-pack variants

* Review insert card

**Component fields (V1):**

* ID

* Company / Brand

* Name (e.g., “Medium Tool”, “3-Pack Box v2 (cheaper vendor)”)

* SKU/code (internal)

* Category (packaging, tool, documentation, etc.) – optional

* Unit of measure (each, box of 55, etc.) – but we will standardize inventory into a base unit (e.g., “each”)

* **Current on-hand quantity** (stored as base units)

* **Reorder point** (units)

* **Lead time (days)** – typical supplier lead time

* **Status**: Active / Inactive

* **Cost per unit** (current default)

* Notes (e.g., “Vendor: XYZ; shipped via air currently”)

V1 **costing** can be single “current cost per unit” per component. We’ll compute BOM costs from this, and when we log usage, we’ll snapshot the BOM cost into the transaction for historical cost reporting.

### **4.3 Sellable SKUs**

A **SKU** here means a sellable product configuration, usually per channel:

Examples:

* “TT-MED-SINGLE-AMZ” – Amazon single medium tool

* “TT-3PK-AMZ” – Amazon 3-pack medium/small/large

* “TT-MED-SINGLE-SHOPIFY” – Shopify single (slightly different packaging)

**SKU fields:**

* ID

* Company / Brand

* Name (human readable)

* Internal SKU code

* External identifiers (optional, for future integration)

  * Amazon ASIN, Shopify handle, etc.

* Sales channel (Amazon, Shopify, Walmart, TikTok, “Generic”)

* Is active

* Notes (e.g., “No review card in Shopify variant”)

### **4.4 BOM and BOM Versions (V1 requirement)**

Each SKU has **one or more BOM versions**, but only **one active BOM version at a time** per SKU in V1.

If Trevor ever truly needs two different BOMs for the *same* SKU actively used in parallel, the PRD assumes that will be modeled as **two SKUs** (e.g., “3-pack v1” and “3-pack v2”) so the system stays simple.

**BOM Version fields:**

* BOM Version ID

* Parent SKU

* Version name / code (e.g., v1, v2, “small-box-cheap-vendor”)

* Effective start date (required)

* Effective end date (optional – null if current)

* Is active flag (only one active per SKU at a time)

* Notes (reason for change, e.g. “Switched to cheaper bubble mailer”)

**BOM Line fields:**

* Component

* Quantity per finished unit (supports fractional quantities; e.g., 1/55 of a case pack)

* Waste factor (optional, future)

**Derived:**

* **Unit BOM cost (current)** \= Σ (component.quantity \* component.current\_cost)

* When we create a **build/shipment transaction**, we also compute and store:

  * Unit BOM cost at that time (using active BOM \+ current component costs)

  * Total BOM cost for that transaction (units built \* unit BOM cost)

---

## **5\. Inventory Model (V1)**

* **Single location**: All inventory assumed to be at Tonsil Tech’s facility.

* **No finished goods inventory**: We track **components only**.

  * “Building/shipping units” is modeled as **consumption** of components plus a transaction record (for reporting).

* **Pooled inventory**: No lot/expiry, no bin or FBA-level stock tracking.

### **5.1 Inventory States**

For each component:

* **On-hand quantity**

* **Consumed quantity** (derived from historical usage log, not a separate state)

* **Adjusted quantity** (through manual corrections)

**Packed but not shipped** is **not tracked in V1**; will be a separate “finished goods” state in V2.

---

## **6\. Functional Requirements**

### **6.1 Authentication & Users**

* Secure login (email/password is fine for V1).

* Admin can:

  * Invite users, set their role (Admin / Ops / Viewer).

  * Deactivate users.

* Session management and basic security best practices.

### **6.2 Component Management**

**Create/Edit component:**

* Admin/Ops can create or edit component records with fields listed above.

* Validation:

  * Names and SKU codes unique per company.

  * Quantities must be numeric; reorder point, cost, lead time must be non-negative.

**Initial inventory import:**

* Simple CSV upload or manual entry to set starting on-hand quantities.

* Optionally, a one-time “Initialize inventory” transaction for each component.

**Component list view:**

* Table of all components with key columns:

  * Name

  * On-hand quantity

  * Reorder status (OK / Warning / Critical)

  * Reorder point

  * Lead time (days)

  * Max buildable units for key SKUs (optional columns or hover)

* Filters:

  * By status (Critical, Warning)

  * By category

  * By active/inactive

### **6.3 SKU & BOM Management**

**Create/Edit SKU:**

* Admin/Ops can create SKUs with fields above.

* Each SKU must belong to the single V1 company (Tonsil Tech), and optionally a brand.

**Define BOM Version for a SKU:**

* Add BOM version:

  * Set version name/code, effective start date, optional notes.

  * Add components \+ quantity per unit (supports decimals).

* Mark as “Active”:

  * When setting an active version, system:

    * Automatically closes previous active version by setting its effective end date (if desired).

* “Clone” from previous version:

  * To simplify incremental changes (e.g., just change bubble mailer component).

**View BOM history:**

* For each SKU, a list of BOM versions with:

  * Version name

  * Effective date range

  * Unit BOM cost (current or as-of last component cost snapshot)

  * Status: Active / Archived

---

### **6.4 Inventory Transactions**

All inventory changes are captured via **transactions**. This is key for auditability and historical cost.

**Transaction types (V1):**

1. **Component Receipt** (Inbound)

   * Fields:

     * Date

     * Supplier (text)

     * Component

     * Quantity received

     * Cost per unit (optional; updating component default cost)

     * Notes (e.g., PO number, shipping type)

   * Effect:

     * Increase on-hand quantity.

     * Optionally update component cost per unit (and maybe keep old value in a cost-history table or just treat this as new default).

2. **Build/Shipment** (Outbound / Consumption)

   * Used when Tonsil Tech builds and ships units, primarily to Amazon or other channels.

   * Fields:

     * Date

     * SKU

     * Sales channel (Amazon, Shopify, etc.)

     * Units built/shipped

     * BOM version (auto-selected as active at that date, but can be overridden)

   * System behavior:

     * Look up BOM lines for that SKU \+ version.

     * Compute total component quantities needed.

     * Validate sufficient on-hand inventory; if not, warn and optionally block or allow with negative stock (configurable).

     * Subtract component quantities from on-hand.

     * Snapshot **unit BOM cost** and **total BOM cost** for the transaction.

3. **Manual Adjustment** (Corrections, shrink, throw-aways, physical counts)

   * Fields:

     * Date

     * Component

     * Adjustment amount (+ or \-)

     * Reason (e.g., “Physical count”, “Damaged tools discarded”, “Lot clean-up”)

   * Effect:

     * Adjust on-hand quantity accordingly.

   * This supports Trevor’s need to “reset” inventory after discovering shrinkage or throwaways.

4. (Optional) **Initial Balance** type

   * Used only at system setup; similar to Receipt but flagged as “init”.

**Transaction log UI:**

* Table listing all transactions, with filters:

  * Date range

  * Type (receipt, build/shipment, adjustment)

  * Component or SKU

  * Channel

* Each row clickable to see details, including cost snapshot for builds.

---

### **6.5 Reorder Logic & Status Flags**

For each component, we use:

* On-hand quantity

* Reorder point

* Lead time (days)

**Status rules (V1):**

* **Critical** – On-hand ≤ reorder point.

* **Warning** – On-hand within X% above reorder point (e.g., \<= 150% of reorder point).

* **OK** – Otherwise.

(Cutoffs can be simple constants or configurable.)

**UI requirements:**

* Components list page:

  * Status indicator chip: green (OK), yellow (Warning), red (Critical).

  * Ability to sort by status and on-hand quantity.

* **Reorder dashboard**:

  * Focused view of components in Warning or Critical.

  * Show:

    * Component name

    * On-hand

    * Reorder point

    * Lead time

    * Short textual hint (e.g., “Order soon (3 weeks lead time)”)

**V2 note:** Email/Slack notifications when status becomes Critical or Warning, but not part of V1 implementation.

---

### **6.6 Capacity Estimation (“How many units can we build?”)**

System must compute, for each SKU (based on active BOM):

* **Max possible units from current inventory**:

For each BOM line:

* `max_units_for_line = floor(on_hand(component) / quantity_per_unit)`

Then:

* `max_units_for_sku = min(max_units_for_line across all components in BOM)`

**UI:**

* **SKU list page**:

  * Columns:

    * SKU name

    * Active BOM version

    * Max units buildable from current inventory

* From a component detail page:

  * Show which SKUs this component participates in.

  * Show how many units of each are constrained by this component (optional but helpful).

---

### **6.7 Costing & Economics (V1)**

**Per component:**

* Store current cost per unit.

* When we record a receipt with a cost, option to:

  * Update default cost per unit.

  * (Optionally in DB: keep a simple cost history, though UI support can be minimal in V1.)

**Per BOM version:**

* Compute **current unit BOM cost** dynamically using current component costs.

* Show in BOM version list and detail.

**Per build/shipment transaction:**

* At transaction time:

  * Compute unit BOM cost using:

    * Active BOM version \+ current component costs.

  * Store:

    * `unit_bom_cost`

    * `total_bom_cost = unit_bom_cost * units_built`

* This supports:

  * Historical cost per unit for each batch.

  * Comparison of cost across BOM versions.

**Defect rates (foundation for future):**

* V1: Add the ability to **tag build/shipment transactions** with:

  * BOM version ID.

* Provide fields on a BOM version for:

  * Notes about observed defects / issues.

* Future versions can:

  * Integrate return/defect data.

  * Compute defect rates per BOM version.

---

### **6.8 Reporting & Views**

**Key screens for V1:**

1. **Dashboard (Home)**

   * Summary tiles:

     * Number of components in Critical, Warning, OK.

     * Top 5 components at risk.

     * Top 5 SKUs by “max units buildable”.

   * Simple time filter for last X days overview (optional).

2. **Components**

   * List view as described above.

   * Detail view:

     * Component info

     * On-hand trend (optional simple sparkline from transactions)

     * Upcoming risk (status, reorder point, lead time)

     * List of BOMs/SKUs using this component

     * Recent transactions involving this component

3. **SKUs & BOMs**

   * SKU list:

     * Name, code, channel

     * Active BOM version

     * Max units buildable

   * SKU detail:

     * SKU info

     * Active BOM version detail

     * Historical BOM versions (with dates, cost)

     * Recent build/shipment transactions for this SKU

4. **Transactions**

   * Filterable log of all transactions:

     * Date, type, component/SKU, quantity change, cost snapshot.

5. **Exports**

   * CSV export for:

     * Components (including current stock, cost, status)

     * SKUs/BOMs

     * Transactions (for deeper analysis in Excel if needed)

---

## **7\. Non‑Functional Requirements**

* **Tech stack:** up to implementation team; must support web front-end \+ simple API/backend.

* **Performance:**

  * Designed for small-to-medium data (tens of thousands of transactions max).

  * UI operations (filters, calculations like max units) should feel instant for V1 scale.

* **Security:**

  * Proper authentication & authorization checks.

  * Encrypted at rest and in transit (HTTPS).

* **Auditability:**

  * Every transaction immutable once created (or at least logged with who/when edited).

* **Usability:**

  * Simple, non-cluttered UI tailored for non-technical ops staff.

  * Avoid forcing users to understand BOM/versioning internals to perform everyday tasks.

---

## **8\. Data Model Sketch (High-Level)**

Entities and key relationships (simplified):

* **Company**

  * has many Brands

* **Brand**

  * has many Components

  * has many SKUs

* **Component**

  * belongs to Brand

  * has many InventoryTransactions

  * has many BOMLines

* **SKU**

  * belongs to Brand

  * has many BOMVersions

  * has many BuildTransactions (subset of InventoryTransactions)

* **BOMVersion**

  * belongs to SKU

  * has many BOMLines

* **BOMLine**

  * belongs to BOMVersion

  * belongs to Component

* **InventoryTransaction**

  * belongs to Company

  * optional belongs to Component

  * optional belongs to SKU

  * optional belongs to BOMVersion (for builds)

  * type: Receipt / Build / Adjustment / Init

  * includes quantity delta and cost snapshot (if applicable)

This gives us enough structure to expand later with:

* Locations

* Lots / expiry

* ExternalChannelSKU mapping

* More brands/companies

---

## **9\. Future Phases (for context)**

**V2 (likely):**

* Multi-location inventory (e.g., “Main warehouse”, “Packed finished goods”, “Amazon FBA – US”).

* “Finished goods” inventory state vs components.

* Shopify integration:

  * Pull orders, map to SKUs, auto-create build/usage transactions (or at least consumption entries).

* Email/Slack alerting for low stock.

* Basic forecasting (using trailing consumption & lead-time).

**V3:**

* Lot numbers & expiry dates for components and finished goods.

* Recall tooling:

  * Given a lot, find all affected SKUs/shipments.

* Deeper analytics:

  * Defect rates by BOM version, vendor comparison.

  * Demand and margin analytics, cross-brand.

---

## **10\. Assumptions & Open Points to Confirm with Trevor**

When you show this to Trevor, you might want his explicit thumbs‑up (or corrections) on:

1. **One active BOM per SKU**

   * If he ever truly runs multiple BOMs for the *same* SKU in parallel, does he agree to model them as **distinct SKUs** (e.g., “3-pack-v1” vs “3-pack-v2”)?

2. **Historical costing granularity**

   * Is it acceptable that **cost per unit** is captured **only at transaction time** (snapshot), using current component costs \+ BOM, rather than full continuous cost history?

3. **Reorder status rules**

   * Are simple threshold \+ status flags (OK/Warning/Critical) enough for now, with no auto-forecasts?

4. **Role simplicity**

   * For V1, is he okay with just Admin/Ops/Viewer roles, or does he want something stricter?

