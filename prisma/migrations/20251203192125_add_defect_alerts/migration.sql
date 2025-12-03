-- CreateTable
CREATE TABLE "DefectThreshold" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "skuId" TEXT,
    "defectRateLimit" DECIMAL(5,2) NOT NULL,
    "affectedRateLimit" DECIMAL(5,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "DefectThreshold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DefectAlert" (
    "id" TEXT NOT NULL,
    "thresholdId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "defectRate" DECIMAL(5,2) NOT NULL,
    "thresholdValue" DECIMAL(5,2) NOT NULL,
    "severity" VARCHAR(20) NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DefectAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DefectThreshold_companyId_isActive_idx" ON "DefectThreshold"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DefectThreshold_companyId_skuId_key" ON "DefectThreshold"("companyId", "skuId");

-- CreateIndex
CREATE INDEX "DefectAlert_thresholdId_createdAt_idx" ON "DefectAlert"("thresholdId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "DefectAlert_skuId_createdAt_idx" ON "DefectAlert"("skuId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "DefectAlert_acknowledgedAt_idx" ON "DefectAlert"("acknowledgedAt");

-- AddForeignKey
ALTER TABLE "DefectThreshold" ADD CONSTRAINT "DefectThreshold_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectThreshold" ADD CONSTRAINT "DefectThreshold_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "SKU"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectThreshold" ADD CONSTRAINT "DefectThreshold_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectAlert" ADD CONSTRAINT "DefectAlert_thresholdId_fkey" FOREIGN KEY ("thresholdId") REFERENCES "DefectThreshold"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectAlert" ADD CONSTRAINT "DefectAlert_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectAlert" ADD CONSTRAINT "DefectAlert_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "SKU"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DefectAlert" ADD CONSTRAINT "DefectAlert_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
