# Shopify Integration (V2-DEFERRED)

This directory contains the complete Shopify integration that was built
for V1 but deferred to V2 per PRD requirements.

## Directory Structure

```
shopify/
  services/       - API client, sync service, order posting
  types/          - TypeScript types for Shopify entities
  components/     - React UI components
  pages/          - Next.js page routes
  api/            - API route handlers
  tests/          - Unit and integration tests
```

## Original Locations

| Current Location | Original Location |
|-----------------|-------------------|
| services/shopify.ts | src/services/shopify.ts |
| services/shopify-sync.ts | src/services/shopify-sync.ts |
| services/order-posting.ts | src/services/order-posting.ts |
| types/*.ts | src/types/*.ts |
| components/*.tsx | src/components/features/*.tsx |
| pages/orders/ | src/app/(dashboard)/orders/ |
| pages/settings/ | src/app/(dashboard)/settings/integrations/shopify/ |
| api/ | src/app/api/shopify/ |
| tests/*.test.ts | tests/unit/*.test.ts |

## Database Models

The Prisma schema still contains the following models (preserved to avoid migration complexity):
- ShopifyConnection
- ShopifyOrder
- ShopifyOrderLine
- SkuChannelMapping
- ShopifyOrderStatus (enum)

These models are marked with V2-DEFERRED comments in the schema.

## Restoration Steps for V2

1. Move files back to original locations:
   ```bash
   mv src/_deferred/shopify/services/* src/services/
   mv src/_deferred/shopify/types/* src/types/
   mv src/_deferred/shopify/components/* src/components/features/
   mv src/_deferred/shopify/api src/app/api/shopify
   mv src/_deferred/shopify/pages/orders src/app/\(dashboard\)/
   mv src/_deferred/shopify/pages/settings/shopify src/app/\(dashboard\)/settings/integrations/
   mv src/_deferred/shopify/tests/* tests/unit/
   ```

2. Remove V2-DEFERRED comments from:
   - `prisma/schema.prisma`
   - `src/lib/env.ts`
   - `src/lib/crypto.ts`

3. Restore SHOPIFY_ENCRYPTION_KEY validation in `src/lib/env.ts`

4. Re-enable Shopify card in settings/integrations page

5. Run `npx prisma generate` to update Prisma client

6. Run `npm run build` to verify

## Last Modified

- **Date**: 2025-12-06
- **Issue**: GitHub Issue #197
- **Reason**: Architectural audit - remove dead code for V1
