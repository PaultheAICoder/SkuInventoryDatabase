-- CreateTable
CREATE TABLE "FinishedGoodsLine" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "quantityChange" DECIMAL(10,4) NOT NULL,
    "costPerUnit" DECIMAL(10,4),
    "locationId" TEXT NOT NULL,

    CONSTRAINT "FinishedGoodsLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinishedGoodsLine_skuId_idx" ON "FinishedGoodsLine"("skuId");

-- CreateIndex
CREATE INDEX "FinishedGoodsLine_locationId_idx" ON "FinishedGoodsLine"("locationId");

-- CreateIndex
CREATE INDEX "FinishedGoodsLine_transactionId_idx" ON "FinishedGoodsLine"("transactionId");

-- AddForeignKey
ALTER TABLE "FinishedGoodsLine" ADD CONSTRAINT "FinishedGoodsLine_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinishedGoodsLine" ADD CONSTRAINT "FinishedGoodsLine_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "SKU"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinishedGoodsLine" ADD CONSTRAINT "FinishedGoodsLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
