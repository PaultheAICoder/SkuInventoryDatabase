-- CreateTable
CREATE TABLE "AlertConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "slackWebhookUrl" VARCHAR(500),
    "emailAddresses" TEXT[],
    "enableSlack" BOOLEAN NOT NULL DEFAULT false,
    "enableEmail" BOOLEAN NOT NULL DEFAULT false,
    "alertMode" VARCHAR(20) NOT NULL DEFAULT 'daily_digest',
    "lastDigestSent" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComponentAlertState" (
    "id" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "lastStatus" VARCHAR(20) NOT NULL,
    "lastAlertSent" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComponentAlertState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AlertConfig_companyId_key" ON "AlertConfig"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ComponentAlertState_componentId_key" ON "ComponentAlertState"("componentId");

-- AddForeignKey
ALTER TABLE "AlertConfig" ADD CONSTRAINT "AlertConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentAlertState" ADD CONSTRAINT "ComponentAlertState_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component"("id") ON DELETE CASCADE ON UPDATE CASCADE;
