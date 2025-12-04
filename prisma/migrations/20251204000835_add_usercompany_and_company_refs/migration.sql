-- AlterTable
ALTER TABLE "Component" ADD COLUMN     "companyId" TEXT;

-- AlterTable
ALTER TABLE "SKU" ADD COLUMN     "companyId" TEXT;

-- Backfill Component.companyId from Brand.companyId
UPDATE "Component"
SET "companyId" = (
  SELECT "companyId" FROM "Brand" WHERE "Brand"."id" = "Component"."brandId"
)
WHERE "companyId" IS NULL;

-- Backfill SKU.companyId from Brand.companyId
UPDATE "SKU"
SET "companyId" = (
  SELECT "companyId" FROM "Brand" WHERE "Brand"."id" = "SKU"."brandId"
)
WHERE "companyId" IS NULL;

-- CreateTable
CREATE TABLE "UserCompany" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ops',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCompany_pkey" PRIMARY KEY ("id")
);

-- Create UserCompany entries for existing users
INSERT INTO "UserCompany" ("id", "userId", "companyId", "role", "assignedAt")
SELECT
  gen_random_uuid()::text,
  "id",
  "companyId",
  "role",
  NOW()
FROM "User"
WHERE NOT EXISTS (
  SELECT 1 FROM "UserCompany"
  WHERE "UserCompany"."userId" = "User"."id"
  AND "UserCompany"."companyId" = "User"."companyId"
);

-- CreateIndex
CREATE INDEX "UserCompany_userId_idx" ON "UserCompany"("userId");

-- CreateIndex
CREATE INDEX "UserCompany_companyId_idx" ON "UserCompany"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "UserCompany_userId_companyId_key" ON "UserCompany"("userId", "companyId");

-- CreateIndex
CREATE INDEX "Component_companyId_isActive_idx" ON "Component"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "SKU_companyId_isActive_idx" ON "SKU"("companyId", "isActive");

-- AddForeignKey
ALTER TABLE "UserCompany" ADD CONSTRAINT "UserCompany_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCompany" ADD CONSTRAINT "UserCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Component" ADD CONSTRAINT "Component_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SKU" ADD CONSTRAINT "SKU_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
