-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'transfer';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "fromLocationId" TEXT,
ADD COLUMN     "toLocationId" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_fromLocationId_idx" ON "Transaction"("fromLocationId");

-- CreateIndex
CREATE INDEX "Transaction_toLocationId_idx" ON "Transaction"("toLocationId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
