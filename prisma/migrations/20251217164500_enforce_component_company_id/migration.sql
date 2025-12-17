-- Make Component.companyId mandatory (required)
-- This enforces tenant scoping at the database level

-- Step 1: Set companyId to NOT NULL (safe because all existing rows have companyId)
ALTER TABLE "Component" ALTER COLUMN "companyId" SET NOT NULL;

-- Step 2: Drop existing FK constraint (ON DELETE SET NULL)
ALTER TABLE "Component" DROP CONSTRAINT IF EXISTS "Component_companyId_fkey";

-- Step 3: Recreate FK constraint with ON DELETE RESTRICT (Prisma default for required relations)
ALTER TABLE "Component" ADD CONSTRAINT "Component_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"(id)
  ON UPDATE CASCADE ON DELETE RESTRICT;
