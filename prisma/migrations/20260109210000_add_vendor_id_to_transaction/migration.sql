-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "vendorId" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_vendorId_idx" ON "Transaction"("vendorId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
