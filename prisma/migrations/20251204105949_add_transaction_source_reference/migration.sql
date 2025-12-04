-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "sourceOrderId" TEXT,
ADD COLUMN     "sourceType" VARCHAR(20);

-- CreateIndex
CREATE INDEX "Transaction_sourceType_sourceOrderId_idx" ON "Transaction"("sourceType", "sourceOrderId");
