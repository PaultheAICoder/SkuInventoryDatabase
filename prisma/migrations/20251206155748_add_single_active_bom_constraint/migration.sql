-- CreateIndex: Enforce single active BOM per SKU at database level
-- This partial unique index allows multiple inactive BOMs per SKU (version history)
-- but only ONE active BOM per SKU
CREATE UNIQUE INDEX "one_active_bom_per_sku" ON "BOMVersion"("skuId") WHERE "isActive" = true;