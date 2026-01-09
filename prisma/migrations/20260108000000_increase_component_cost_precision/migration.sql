-- AlterTable: Increase Component.costPerUnit precision from Decimal(10, 4) to Decimal(12, 6)
-- This allows storing high-precision component costs like 0.011625 per unit
-- which previously would be rounded to 0.0116 (4 decimal places)
ALTER TABLE "Component" ALTER COLUMN "costPerUnit" TYPE DECIMAL(12,6);
