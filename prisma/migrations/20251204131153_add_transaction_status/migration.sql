-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('draft', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "rejectReason" VARCHAR(500),
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "status" "TransactionStatus" NOT NULL DEFAULT 'approved';

-- CreateIndex
CREATE INDEX "Transaction_companyId_status_idx" ON "Transaction"("companyId", "status");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
