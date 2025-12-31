-- AlterTable: Increase BOMLine.quantityPerUnit precision from Decimal(10, 4) to Decimal(18, 10)
-- This allows storing high-precision fractional quantities like 1/60 (0.0166666667)
-- which previously would be rounded to 0.0167 (4 decimal places)
ALTER TABLE "BOMLine" ALTER COLUMN "quantityPerUnit" TYPE DECIMAL(18,10);
