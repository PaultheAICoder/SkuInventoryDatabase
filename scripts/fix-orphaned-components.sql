-- Fix orphaned components created by inventory-snapshot import
-- Issue #174: Components imported via XLSX don't appear in components list
--
-- This script updates components that have null companyId by inheriting
-- the companyId from their associated brand.

-- Preview: Show affected components
SELECT
  c.id,
  c.name,
  c."skuCode",
  c."brandId",
  b.name as brand_name,
  b."companyId" as brand_company_id,
  c."companyId" as component_company_id
FROM "Component" c
JOIN "Brand" b ON c."brandId" = b.id
WHERE c."companyId" IS NULL;

-- Fix: Update companyId from brand
UPDATE "Component" c
SET "companyId" = b."companyId"
FROM "Brand" b
WHERE c."brandId" = b.id
  AND c."companyId" IS NULL;

-- Verify: Confirm no orphaned components remain
SELECT COUNT(*) as orphaned_count
FROM "Component"
WHERE "companyId" IS NULL;
