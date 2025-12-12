# PRD — Trevor Database Expansion: Sales + Ads + SEO (Tonsil Tech → Multi-brand)

## 1) Background and context

The existing "Trevor Database" work started as a component/SKU inventory tracker for Tonsil Tech, replacing a fragile spreadsheet + ChatGPT workflow with a deterministic web portal so the team can see current balances, transactions, and SKU configurations without downloading/uploading files.

This new PRD covers the **next feature set** discussed: **Amazon ads management intelligence, organic vs ad sales reporting, SEO recommendations, a consultant-style chatbot, and Shopify read-only integration**, while keeping the system deterministic and audit-friendly (AI helps *generate recommendations/tools*, not "randomly operate your accounts").

The attached screenshot aligns with this scope: Amazon Ads portfolio performance (multiple portfolios like Discovery / Accelerate / Zon / Competitor Targeting) and a keyword-performance sheet used to manually pick/move "winning keywords."

---

## 2) Goals

### Business goals

* Replace manual "pull 4 reports → upload to ChatGPT → hope it works" reporting with a consistent dashboard.
* Systematically identify and operationalize "winning keywords" across first-party and third-party sources, and produce an actionable weekly plan.
* Track and grow **organic share of sales vs ad-driven share** over time (trailing 30 → 12+ months), per SKU/ASIN.
* Create a foundation to reuse across future brands (e.g., Mela Vitamins), not just Tonsil Tech.

### User goals

* "Log in Monday" and see recommended changes for the week, then mark which changes were implemented (accepted).
* Stop maintaining ad-change history in Apple Notes; keep a durable change log inside the tool.
* Get SEO/listing guidance (Amazon first; Shopify later) and optionally generate draft titles/bullets from chosen keywords.
* Ask "expert-like" questions (packaging tradeoffs, category ROAS benchmarks, etc.) via a consultant chatbot.

---

## 3) Non-goals (for MVP)

* **No automatic changes to Amazon or Shopify accounts in MVP** (recommendations only).
* No lot/expiry/recall tracking (already noted as future/v3 in prior project context).
* No full competitor scraping beyond what's available via permitted APIs / imported reports.

---

## 4) Personas

1. **Owner/Operator (Trevor)**: sets strategy, reviews recommendations, implements changes in Amazon Ads UI.
2. **Brand Ops Teammate**: views dashboards, exports reports, limited permissions.
3. **Consultant/Analyst (future)**: can access ads + reporting modules for multiple brands, but cannot see inventory or admin keys.

---

## 5) Product scope overview

A single web app with modular tabs:

* **Inventory** (existing foundation)
* **Sales Analytics**
* **Amazon Ads Intelligence**
* **SEO / Listing**
* **Issues / Support**
* **Admin (Integrations, Permissions, Audit)**

A key product principle: **deterministic pipelines** for ingest/compute + **human-in-the-loop execution** for account changes.

---

## 6) Functional requirements

### A) Amazon Ads Intelligence (MVP)

**A1. Data ingestion**

* Pull campaign/portfolio metrics needed for: Spend, Sales, ROAS, Impressions, Clicks, CPC, Orders (as available) across portfolios (e.g., Discovery, Accelerate, Zon, Competitor Targeting—mirrors screenshot).
* Support ingesting keyword/search-term exports (CSV) from:

  * Amazon Ads exports (first-party)
  * Third-party tools (e.g., ZonGuru/Helium10) via file upload/import, since direct API access may not exist.

**A2. Keyword performance workspace**

* A table view similar to the current "Excel keyword sheet" workflow:

  * Keyword, match type, impressions, clicks, CTR, spend, CPC, orders, sales, ROAS, conversion rate
  * Filters: portfolio, campaign, date range, min impressions, min clicks/orders
* "Statistical significance helpers":

  * Flags for low-signal keywords (e.g., 1 impression / 100% conversion) to avoid overreacting.
  * Configurable thresholds (defaults provided; user-adjustable).

**A3. Recommendation engine (recommend-only)**
Generate **action items** (not automatic changes), including:

* Promote/"graduate" winning search terms from Discovery into Accelerate (mirrors the described workflow and screenshot portfolio structure).
* Detect duplicated keywords across portfolios/campaigns and recommend consolidation or strategy changes.
* Negative keyword suggestions for Discovery/open-ended campaigns (based on poor performance and/or conflicts with "already winning elsewhere").
* Budget/bid strategy guidance (e.g., "max bid only goes down" vs "Amazon can go up/down") presented as hypotheses + expected impact, since strategy differences matter to spend efficiency.

**A4. Weekly "Monday dashboard" + acceptance workflow**

* A "This week's recommended changes" list.
* Each recommendation can be:

  * Accepted (implemented)
  * Rejected (with reason)
  * Snoozed
* On acceptance, write to a **Change Log** and update any "tracking set" of watched keywords.

**A5. Change Log (replace Apple Notes)**

* Store every accepted/rejected recommendation with timestamp, before/after values (when known), and notes.
* Support a "watched keywords" list (favorites) so the UI can highlight them in future periods.

---

### B) Sales Analytics: Organic vs Ad-Driven (MVP)

**B1. Report outputs**

* Per SKU/ASIN:

  * Total sales
  * Ad-attributed sales
  * Organic sales (delta approach initially, with room to improve)
  * Organic % share trend
* Time windows:

  * Trailing 7 / 30 / 90 days
  * Monthly rollups
  * Up to 12+ months (where data availability allows)

**B2. Reduce manual report pulling**

* Replace the brittle workflow of downloading multiple reports that "sometimes works, sometimes doesn't" via ChatGPT.
* If certain metrics still require manual exports initially, provide a guided upload with validation and consistent parsing.

---

### C) SEO / Listing Recommendations (Phase 2, but designed now)

**C1. Amazon-first SEO guidance**

* Recommendations based on chosen keyword sets (from Ads Intelligence and/or third-party keyword tools).
* Output:

  * Title/bullets drafts
  * Back-end search terms suggestions (if applicable)
  * Image ordering / "conversion friction" hypotheses (e.g., users leaving after seeing certain images)
* Explicitly: action items, not automatic listing edits (for now).

**C2. Optional: integrate "listing optimizer" style flows**

* Similar to using a tool to generate listing copy from selected keywords.

---

### D) Shopify integration (Read-only, MVP+)

**D1. Secure read-only connection**

* Create/receive Shopify API credentials with **read-only scopes** only (explicitly "check every box that says read").
* Ingest:

  * Orders
  * Products
  * Customers (read-only)

**D2. Use cases**

* Show Shopify sell-through as a small but tracked contributor (and later unify CAC/ROAS across channels).

---

### E) "Amazon Consultant" Chatbot (MVP-lite)

* A guided Q&A tool inside the app to answer operational questions (packaging tradeoffs, ROAS benchmarking concepts, etc.).
* Must clearly separate:

  * **Facts from your data** (dashboards)
  * **Advice/hypotheses** (assistant output)
* (Later) connect to internal data + saved decisions, so it can reference your past changes and results.

---

### F) Issues / Support workflow improvements (MVP)

* When a user marks an issue "not fixed," automatically ask better follow-up questions.
* Optionally attach a screenshot of the page at issue-submission time to improve debugging context.
* Return "3 suggested fixes" as part of issue response, and allow the user to pick/clarify preferred approach.

---

### G) Permissions and multi-brand

* Multi-tenant "Brand" concept: Tonsil Tech now; Mela and others later.
* Permissions so some users can see ads/analytics but not integrations/admin (and vice versa).

---

## 7) Data model (high-level)

* **Brand**
* **User, Role, Permission**
* **IntegrationCredential** (encrypted, scoped; read-only where possible)
* **SKU / ASIN mapping**
* **AdPortfolio, Campaign, AdGroup**
* **Keyword / SearchTerm**
* **Recommendation** (type, rationale, confidence, expected impact, status)
* **ChangeLogEntry** (accepted/rejected/snoozed; notes; before/after snapshot refs)
* **SalesDaily** (total, ad-attributed, organic-derived)
* (Existing foundation) **Component, BOMVersion, InventoryLedger**

---

## 8) Key UX screens (MVP)

1. **Amazon Ads Dashboard (Portfolios)**: portfolio cards + trend graphs (mirrors screenshot).
2. **Keyword Explorer**: sortable/filterable table + significance flags + "Watch" toggle.
3. **Weekly Plan ("Monday")**: recommendations queue + Accept/Reject/Snooze + bulk actions.
4. **Organic vs Ad Sales**: trailing windows and per-SKU drilldown.
5. **Change Log**: searchable timeline of actions and outcomes.
6. **Integrations**: connect Amazon Ads + Shopify (read-only) + CSV import sources.
7. **Issues**: submit → follow-ups → suggested fixes.

---

## 9) Security and compliance requirements

* Read-only wherever feasible for external integrations (Shopify explicitly read-only initially).
* Credentials stored encrypted; access limited by role.
* Clear audit trail of every recommendation and user action.

---

## 10) Success metrics

* Time saved per month vs manual report pulling.
* % of recommendations reviewed and actioned weekly.
* Improved ad efficiency (ROAS, CPC) and rising organic share over time.
* Reduction in "notes outside the system" for ad changes.

---

## 11) Milestones (proposed)

* **MVP-0 (Access & ingestion):** Amazon Ads exports/API ingestion + Shopify read-only connection scaffolding.
* **MVP-1 (Dashboards):** Portfolios dashboard + keyword explorer + organic vs ad report.
* **MVP-2 (Recommendations + Change Log):** weekly plan, accept/reject flow, stored history.
* **Phase 2 (SEO module):** listing recommendations + draft copy generation.
* **Phase 3 (Cross-channel):** unify Amazon + Shopify + Google Ads into a consolidated e-comm view.

---

If you want, I can also turn this into a "V1 build sheet" (a tighter checklist of endpoints, tables, and UI components) that maps directly to implementation tickets—using the same modules and terminology above.
