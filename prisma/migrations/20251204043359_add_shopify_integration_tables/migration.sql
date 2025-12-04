-- CreateEnum
CREATE TYPE "ShopifyOrderStatus" AS ENUM ('pending', 'approved', 'posted', 'skipped', 'error');

-- CreateTable
CREATE TABLE "ShopifyConnection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "shopName" VARCHAR(100) NOT NULL,
    "accessToken" VARCHAR(255) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "syncStatus" VARCHAR(50),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopifyOrder" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyOrderNumber" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "fulfillmentStatus" VARCHAR(50),
    "financialStatus" VARCHAR(50),
    "status" "ShopifyOrderStatus" NOT NULL DEFAULT 'pending',
    "transactionId" TEXT,
    "errorMessage" TEXT,
    "rawData" JSONB NOT NULL DEFAULT '{}',
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "ShopifyOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopifyOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "shopifyLineId" TEXT NOT NULL,
    "shopifyVariantId" TEXT,
    "shopifySku" VARCHAR(100),
    "title" VARCHAR(255) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "mappedSkuId" TEXT,
    "mappingStatus" VARCHAR(20) NOT NULL DEFAULT 'unmapped',

    CONSTRAINT "ShopifyOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkuChannelMapping" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "channelType" VARCHAR(20) NOT NULL DEFAULT 'shopify',
    "externalId" VARCHAR(100) NOT NULL,
    "externalSku" VARCHAR(100),
    "skuId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkuChannelMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopifyConnection_companyId_isActive_idx" ON "ShopifyConnection"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyConnection_companyId_key" ON "ShopifyConnection"("companyId");

-- CreateIndex
CREATE INDEX "ShopifyOrder_connectionId_status_idx" ON "ShopifyOrder"("connectionId", "status");

-- CreateIndex
CREATE INDEX "ShopifyOrder_syncedAt_idx" ON "ShopifyOrder"("syncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyOrder_connectionId_shopifyOrderId_key" ON "ShopifyOrder"("connectionId", "shopifyOrderId");

-- CreateIndex
CREATE INDEX "ShopifyOrderLine_orderId_idx" ON "ShopifyOrderLine"("orderId");

-- CreateIndex
CREATE INDEX "ShopifyOrderLine_shopifyVariantId_idx" ON "ShopifyOrderLine"("shopifyVariantId");

-- CreateIndex
CREATE INDEX "SkuChannelMapping_companyId_channelType_idx" ON "SkuChannelMapping"("companyId", "channelType");

-- CreateIndex
CREATE INDEX "SkuChannelMapping_skuId_idx" ON "SkuChannelMapping"("skuId");

-- CreateIndex
CREATE UNIQUE INDEX "SkuChannelMapping_companyId_channelType_externalId_key" ON "SkuChannelMapping"("companyId", "channelType", "externalId");

-- AddForeignKey
ALTER TABLE "ShopifyConnection" ADD CONSTRAINT "ShopifyConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopifyOrder" ADD CONSTRAINT "ShopifyOrder_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ShopifyConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopifyOrderLine" ADD CONSTRAINT "ShopifyOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShopifyOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuChannelMapping" ADD CONSTRAINT "SkuChannelMapping_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuChannelMapping" ADD CONSTRAINT "SkuChannelMapping_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "SKU"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
