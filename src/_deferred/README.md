# Deferred V2 Features

This directory contains code that was implemented prematurely for V1 but is
deferred to V2 per PRD requirements.

## Contents

### shopify/
Complete Shopify integration including:
- API client and sync services
- Order review queue UI
- SKU channel mapping
- Connection management

**Status**: Deferred until V2
**Original Implementation**: December 2025
**Reason**: PRD V1 explicitly excludes integrations

## Restoration

To restore these features for V2:
1. Move files back to their original locations in `src/`
2. Uncomment schema models in `prisma/schema.prisma`
3. Run `npx prisma generate`
4. Update route exports and navigation
