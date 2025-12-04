-- CreateTable
CREATE TABLE "ForecastConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "lookbackDays" INTEGER NOT NULL DEFAULT 30,
    "safetyDays" INTEGER NOT NULL DEFAULT 7,
    "excludedTransactionTypes" TEXT[] DEFAULT ARRAY['initial', 'adjustment']::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForecastConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ForecastConfig_companyId_key" ON "ForecastConfig"("companyId");

-- AddForeignKey
ALTER TABLE "ForecastConfig" ADD CONSTRAINT "ForecastConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
