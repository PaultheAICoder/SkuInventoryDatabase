-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Category_companyId_isActive_idx" ON "Category"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Category_companyId_name_key" ON "Category"("companyId", "name");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
