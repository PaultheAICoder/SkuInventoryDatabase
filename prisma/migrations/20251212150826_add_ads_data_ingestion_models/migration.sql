-- AlterEnum
ALTER TYPE "FeedbackStatus" ADD VALUE 'clarification_requested';

-- AlterTable
ALTER TABLE "Feedback" ADD COLUMN     "clarificationAnswers" TEXT,
ADD COLUMN     "clarificationContext" TEXT,
ADD COLUMN     "clarificationMessageId" VARCHAR(255),
ADD COLUMN     "clarificationQuestions" TEXT,
ADD COLUMN     "clarificationSentAt" TIMESTAMP(3),
ADD COLUMN     "projectId" VARCHAR(100) NOT NULL DEFAULT 'SkuInventoryDatabase';

-- CreateTable
CREATE TABLE "IntegrationCredential" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "brandId" TEXT,
    "integrationType" VARCHAR(50) NOT NULL,
    "encryptedAccessToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3),
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "lastUsedAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "externalAccountId" VARCHAR(100),
    "externalAccountName" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdPortfolio" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "externalId" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "state" VARCHAR(20) NOT NULL DEFAULT 'enabled',
    "budgetAmount" DECIMAL(10,2),
    "budgetCurrencyCode" VARCHAR(3),
    "budgetPolicy" VARCHAR(20),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdPortfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCampaign" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT,
    "credentialId" TEXT NOT NULL,
    "externalId" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "campaignType" VARCHAR(50) NOT NULL,
    "targetingType" VARCHAR(50),
    "state" VARCHAR(20) NOT NULL DEFAULT 'enabled',
    "dailyBudget" DECIMAL(10,2),
    "startDate" DATE,
    "endDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdGroup" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "externalId" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "state" VARCHAR(20) NOT NULL DEFAULT 'enabled',
    "defaultBid" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeywordMetric" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT,
    "campaignId" TEXT,
    "adGroupId" TEXT,
    "keyword" VARCHAR(500) NOT NULL,
    "matchType" VARCHAR(20) NOT NULL,
    "date" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "ctr" DECIMAL(8,4),
    "spend" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cpc" DECIMAL(10,2),
    "orders" INTEGER NOT NULL DEFAULT 0,
    "sales" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "roas" DECIMAL(10,2),
    "conversionRate" DECIMAL(8,4),
    "acos" DECIMAL(8,4),
    "source" VARCHAR(50) NOT NULL,
    "sourceFileName" VARCHAR(255),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeywordMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesDaily" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "asin" VARCHAR(20),
    "skuId" TEXT,
    "date" DATE NOT NULL,
    "totalSales" DECIMAL(10,2) NOT NULL,
    "adAttributedSales" DECIMAL(10,2) NOT NULL,
    "organicSales" DECIMAL(10,2) NOT NULL,
    "channel" VARCHAR(50) NOT NULL,
    "unitsTotal" INTEGER,
    "unitsAdAttributed" INTEGER,
    "unitsOrganic" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AsinSkuMapping" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "asin" VARCHAR(20) NOT NULL,
    "skuId" TEXT NOT NULL,
    "productName" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "AsinSkuMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT,
    "syncType" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "recordsProcessed" INTEGER NOT NULL DEFAULT 0,
    "recordsCreated" INTEGER NOT NULL DEFAULT 0,
    "recordsUpdated" INTEGER NOT NULL DEFAULT 0,
    "recordsDeleted" INTEGER NOT NULL DEFAULT 0,
    "recordsFailed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "errorDetails" JSONB NOT NULL DEFAULT '{}',
    "fileName" VARCHAR(255),
    "fileSize" INTEGER,
    "triggeredById" TEXT,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "message" TEXT NOT NULL,
    "relatedType" VARCHAR(50),
    "relatedId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationCredential_companyId_integrationType_idx" ON "IntegrationCredential"("companyId", "integrationType");

-- CreateIndex
CREATE INDEX "IntegrationCredential_status_idx" ON "IntegrationCredential"("status");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationCredential_companyId_brandId_integrationType_key" ON "IntegrationCredential"("companyId", "brandId", "integrationType");

-- CreateIndex
CREATE INDEX "AdPortfolio_credentialId_idx" ON "AdPortfolio"("credentialId");

-- CreateIndex
CREATE UNIQUE INDEX "AdPortfolio_credentialId_externalId_key" ON "AdPortfolio"("credentialId", "externalId");

-- CreateIndex
CREATE INDEX "AdCampaign_portfolioId_idx" ON "AdCampaign"("portfolioId");

-- CreateIndex
CREATE INDEX "AdCampaign_credentialId_idx" ON "AdCampaign"("credentialId");

-- CreateIndex
CREATE UNIQUE INDEX "AdCampaign_credentialId_externalId_key" ON "AdCampaign"("credentialId", "externalId");

-- CreateIndex
CREATE INDEX "AdGroup_campaignId_idx" ON "AdGroup"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "AdGroup_campaignId_externalId_key" ON "AdGroup"("campaignId", "externalId");

-- CreateIndex
CREATE INDEX "KeywordMetric_portfolioId_date_idx" ON "KeywordMetric"("portfolioId", "date");

-- CreateIndex
CREATE INDEX "KeywordMetric_campaignId_date_idx" ON "KeywordMetric"("campaignId", "date");

-- CreateIndex
CREATE INDEX "KeywordMetric_keyword_idx" ON "KeywordMetric"("keyword");

-- CreateIndex
CREATE INDEX "KeywordMetric_date_idx" ON "KeywordMetric"("date");

-- CreateIndex
CREATE UNIQUE INDEX "KeywordMetric_portfolioId_campaignId_adGroupId_keyword_matc_key" ON "KeywordMetric"("portfolioId", "campaignId", "adGroupId", "keyword", "matchType", "date", "source");

-- CreateIndex
CREATE INDEX "SalesDaily_brandId_date_idx" ON "SalesDaily"("brandId", "date");

-- CreateIndex
CREATE INDEX "SalesDaily_asin_idx" ON "SalesDaily"("asin");

-- CreateIndex
CREATE INDEX "SalesDaily_date_idx" ON "SalesDaily"("date");

-- CreateIndex
CREATE UNIQUE INDEX "SalesDaily_brandId_asin_date_channel_key" ON "SalesDaily"("brandId", "asin", "date", "channel");

-- CreateIndex
CREATE INDEX "AsinSkuMapping_brandId_idx" ON "AsinSkuMapping"("brandId");

-- CreateIndex
CREATE INDEX "AsinSkuMapping_skuId_idx" ON "AsinSkuMapping"("skuId");

-- CreateIndex
CREATE UNIQUE INDEX "AsinSkuMapping_brandId_asin_key" ON "AsinSkuMapping"("brandId", "asin");

-- CreateIndex
CREATE INDEX "SyncLog_credentialId_startedAt_idx" ON "SyncLog"("credentialId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "SyncLog_syncType_status_idx" ON "SyncLog"("syncType", "status");

-- CreateIndex
CREATE INDEX "SyncLog_startedAt_idx" ON "SyncLog"("startedAt" DESC);

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "IntegrationCredential" ADD CONSTRAINT "IntegrationCredential_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationCredential" ADD CONSTRAINT "IntegrationCredential_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdPortfolio" ADD CONSTRAINT "AdPortfolio_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "IntegrationCredential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "AdPortfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdGroup" ADD CONSTRAINT "AdGroup_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeywordMetric" ADD CONSTRAINT "KeywordMetric_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "AdPortfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeywordMetric" ADD CONSTRAINT "KeywordMetric_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeywordMetric" ADD CONSTRAINT "KeywordMetric_adGroupId_fkey" FOREIGN KEY ("adGroupId") REFERENCES "AdGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesDaily" ADD CONSTRAINT "SalesDaily_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsinSkuMapping" ADD CONSTRAINT "AsinSkuMapping_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsinSkuMapping" ADD CONSTRAINT "AsinSkuMapping_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "SKU"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsinSkuMapping" ADD CONSTRAINT "AsinSkuMapping_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncLog" ADD CONSTRAINT "SyncLog_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "IntegrationCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncLog" ADD CONSTRAINT "SyncLog_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
