# Shopify API Routes (V2-DEFERRED)

Moved from `src/app/api/shopify/` on 2025-12-06.

## Route Structure

```
api/
  connection/
    route.ts          - GET/POST connection settings
    test/route.ts     - POST connection test
  mappings/
    route.ts          - GET/POST mappings list/create
    [id]/route.ts     - PATCH/DELETE individual mapping
    import/route.ts   - POST CSV import
  orders/
    route.ts          - GET orders list
    [id]/
      route.ts        - GET order details
      approve/route.ts - POST approve order
      skip/route.ts   - POST skip order
      post/route.ts   - POST order to inventory
      lines/
        [lineId]/route.ts - PATCH line mapping
    post-batch/route.ts - POST batch orders
  sync/
    route.ts          - POST trigger sync
```

## Original Base URL

`/api/shopify/`

## Restoration

Move this entire directory back to `src/app/api/shopify` for V2.
