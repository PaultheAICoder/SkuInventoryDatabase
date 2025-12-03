-- AlterTable
ALTER TABLE "BOMVersion" ADD COLUMN     "defectNotes" TEXT,
ADD COLUMN     "qualityMetadata" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "defectCount" INTEGER,
ADD COLUMN     "defectNotes" TEXT,
ADD COLUMN     "affectedUnits" INTEGER;
