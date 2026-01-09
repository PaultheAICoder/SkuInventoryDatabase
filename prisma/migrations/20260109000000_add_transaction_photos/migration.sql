-- CreateTable
CREATE TABLE "TransactionPhoto" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "s3Key" VARCHAR(500) NOT NULL,
    "s3Bucket" VARCHAR(100) NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(50) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "caption" VARCHAR(500),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT NOT NULL,

    CONSTRAINT "TransactionPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransactionPhoto_transactionId_idx" ON "TransactionPhoto"("transactionId");

-- CreateIndex
CREATE INDEX "TransactionPhoto_uploadedAt_idx" ON "TransactionPhoto"("uploadedAt");

-- AddForeignKey
ALTER TABLE "TransactionPhoto" ADD CONSTRAINT "TransactionPhoto_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionPhoto" ADD CONSTRAINT "TransactionPhoto_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
