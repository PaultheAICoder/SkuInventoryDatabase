# Migration Verification Guide

This document describes how to verify that multi-location inventory migrations have been applied correctly.

## Migration Checklist

### Database Schema Verification

Run the following SQL queries to verify the schema is correct:

```sql
-- 1. Verify Location table exists with all required columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'Location'
ORDER BY ordinal_position;

-- Expected columns:
-- id, companyId, name, type, isDefault, isActive, notes, createdAt, updatedAt

-- 2. Verify Transaction.locationId FK exists
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'Transaction'
  AND column_name IN ('locationId', 'fromLocationId', 'toLocationId');

-- 3. Verify FinishedGoodsLine table exists
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'FinishedGoodsLine'
ORDER BY ordinal_position;

-- Expected columns:
-- id, transactionId, skuId, locationId, quantityChange, createdAt
```

### Default Location Verification

Each company should have exactly one default location:

```sql
-- Verify each company has a default location
SELECT c.id as company_id, c.name as company_name, l.name as default_location
FROM "Company" c
LEFT JOIN "Location" l ON l."companyId" = c.id AND l."isDefault" = true
ORDER BY c.name;

-- All companies should have a non-null default_location
```

### Index Verification

```sql
-- Verify indexes exist for performance
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('Location', 'Transaction', 'FinishedGoodsLine')
ORDER BY tablename, indexname;

-- Expected indexes:
-- Location: Location_companyId_isActive_idx, Location_pkey
-- Transaction: Transaction_locationId_idx, Transaction_fromLocationId_idx, Transaction_toLocationId_idx
-- FinishedGoodsLine: FinishedGoodsLine_skuId_locationId_idx
```

## Verification Commands

### Using Prisma

```bash
# Generate Prisma client (should not show errors)
npx prisma generate

# Validate schema matches database
npx prisma db pull --force
npx prisma format
git diff prisma/schema.prisma  # Should show no changes if migrations are correct
```

### Using the API

```bash
# 1. Verify locations endpoint works
curl -X GET http://localhost:4545/api/locations \
  -H "Cookie: your-session-cookie"

# 2. Create a test receipt with location
curl -X POST http://localhost:4545/api/transactions/receipt \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{
    "componentId": "your-component-id",
    "quantity": 10,
    "supplier": "Test",
    "date": "2024-01-15",
    "locationId": "your-location-id"
  }'

# 3. Verify inventory query with location filter
curl -X GET "http://localhost:4545/api/components/your-id?locationId=loc-id" \
  -H "Cookie: your-session-cookie"
```

## Migration Rollback

If you need to rollback migrations, use:

```bash
# Rollback to previous migration
npx prisma migrate resolve --rolled-back 20240101_add_locations

# Then re-run migrations
npx prisma migrate dev
```

## Common Issues

### Issue: Foreign key constraint violation

**Symptom**: Error when creating transactions without locationId

**Solution**: Update the transaction creation to use default location:
```typescript
const defaultLocation = await prisma.location.findFirst({
  where: { companyId, isDefault: true }
});
if (!defaultLocation) throw new Error('No default location');
```

### Issue: Location type enum mismatch

**Symptom**: Invalid value for LocationType

**Valid values**: `warehouse`, `threepl`, `fba`, `finished_goods`

### Issue: Missing default location for company

**Symptom**: 500 error when creating transactions

**Solution**: Ensure seed data includes default location:
```sql
INSERT INTO "Location" (id, "companyId", name, type, "isDefault", "isActive")
VALUES (gen_random_uuid(), 'company-id', 'Main Warehouse', 'warehouse', true, true);
```

## Post-Migration Testing

After migration, run the test suite to verify functionality:

```bash
# Unit tests
npm run test

# Integration tests
npm run test:integration

# E2E tests (requires running server)
npm run test:e2e
```

All tests should pass. If location-related tests fail, check:
1. Default location exists for test company
2. Session includes `selectedCompanyId`
3. Component/SKU have `companyId` set (not just `brandId`)
