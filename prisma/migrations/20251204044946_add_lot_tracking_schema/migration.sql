-- AlterTable
ALTER TABLE "TransactionLine" ADD COLUMN     "lotId" TEXT;

-- CreateTable
CREATE TABLE "Lot" (
    "id" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "lotNumber" VARCHAR(100) NOT NULL,
    "expiryDate" DATE,
    "receivedQuantity" DECIMAL(10,4) NOT NULL,
    "supplier" VARCHAR(100),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotBalance" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "quantity" DECIMAL(10,4) NOT NULL,
    "reservedQuantity" DECIMAL(10,4) NOT NULL DEFAULT 0,

    CONSTRAINT "LotBalance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lot_componentId_idx" ON "Lot"("componentId");

-- CreateIndex
CREATE INDEX "Lot_expiryDate_idx" ON "Lot"("expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "Lot_componentId_lotNumber_key" ON "Lot"("componentId", "lotNumber");

-- CreateIndex
CREATE UNIQUE INDEX "LotBalance_lotId_key" ON "LotBalance"("lotId");

-- CreateIndex
CREATE INDEX "LotBalance_lotId_idx" ON "LotBalance"("lotId");

-- CreateIndex
CREATE INDEX "TransactionLine_lotId_idx" ON "TransactionLine"("lotId");

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotBalance" ADD CONSTRAINT "LotBalance_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionLine" ADD CONSTRAINT "TransactionLine_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
