# Sales + Ads + SEO Implementation Plan

## Overview

This document outlines the phased implementation approach for the Sales + Ads + SEO feature expansion based on `PRD-sales-ads-seo.md`.

## Milestones

### MVP-0: Data Ingestion & Foundation
**Focus**: Build the data layer that everything else depends on

- Amazon Ads data ingestion (API + CSV upload)
- Shopify read-only connection scaffolding
- Core data models: Brand, IntegrationCredential, AdPortfolio, Campaign, AdGroup, Keyword/SearchTerm, SalesDaily
- SKU/ASIN mapping to existing inventory system

### MVP-1: Dashboards & Analytics
**Focus**: Visualization and reporting

- Amazon Ads Dashboard (portfolio cards + trend graphs)
- Keyword Explorer (sortable/filterable table + significance flags)
- Organic vs Ad Sales report (trailing 7/30/90 days, monthly rollups)
- Per-SKU drilldown views

### MVP-2: Recommendations & Change Management
**Focus**: Intelligence and workflow

- Recommendation engine (keyword graduation, duplicates, negatives, bid guidance)
- Weekly "Monday Dashboard" with recommendations queue
- Accept/Reject/Snooze workflow
- Change Log (replaces Apple Notes for ad change history)
- Watched keywords list

### Phase 2: SEO Module (Future)
- Amazon listing recommendations
- Title/bullet draft generation
- Backend search terms suggestions

### Phase 3: Cross-Channel (Future)
- Unified Amazon + Shopify + Google Ads view
- Consolidated CAC/ROAS metrics

## Implementation Approach

Each milestone follows the speckit workflow:

```
/speckit.specify → /speckit.clarify → /speckit.plan → /speckit.tasks → /speckit.analyze → /speckit.implement
```

## Progress Tracking

| Milestone | Specify | Clarify | Plan | Tasks | Analyze | Implement | Status |
|-----------|---------|---------|------|-------|---------|-----------|--------|
| MVP-0     | [ ]     | [ ]     | [ ]  | [ ]   | [ ]     | [ ]       | Not Started |
| MVP-1     | [ ]     | [ ]     | [ ]  | [ ]   | [ ]     | [ ]       | Not Started |
| MVP-2     | [ ]     | [ ]     | [ ]  | [ ]   | [ ]     | [ ]       | Not Started |

## Reference Documents

- PRD: `/PRD-sales-ads-seo.md`
- Existing Prisma Schema: `/prisma/schema.prisma`
- Speckit Commands: `/.claude/commands/speckit.*.md`
