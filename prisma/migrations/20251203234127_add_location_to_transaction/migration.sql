-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "locationId" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_locationId_idx" ON "Transaction"("locationId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
