-- CreateTable
CREATE TABLE "InventoryBalance" (
    "id" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" DECIMAL(10,4) NOT NULL,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinishedGoodsBalance" (
    "id" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" DECIMAL(10,4) NOT NULL,

    CONSTRAINT "FinishedGoodsBalance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryBalance_componentId_idx" ON "InventoryBalance"("componentId");

-- CreateIndex
CREATE INDEX "InventoryBalance_locationId_idx" ON "InventoryBalance"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBalance_componentId_locationId_key" ON "InventoryBalance"("componentId", "locationId");

-- CreateIndex
CREATE INDEX "FinishedGoodsBalance_skuId_idx" ON "FinishedGoodsBalance"("skuId");

-- CreateIndex
CREATE INDEX "FinishedGoodsBalance_locationId_idx" ON "FinishedGoodsBalance"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "FinishedGoodsBalance_skuId_locationId_key" ON "FinishedGoodsBalance"("skuId", "locationId");

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinishedGoodsBalance" ADD CONSTRAINT "FinishedGoodsBalance_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "SKU"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinishedGoodsBalance" ADD CONSTRAINT "FinishedGoodsBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
