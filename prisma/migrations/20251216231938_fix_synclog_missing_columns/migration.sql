-- Fix SyncLog table: Add missing columns from failed migration
-- Migration 20251212150826_add_ads_data_ingestion_models was marked applied but SQL did not execute
-- for the SyncLog columns (companyId, integrationType, initiatedBy, metadata)

-- Add missing columns with IF NOT EXISTS for idempotency
ALTER TABLE "SyncLog" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "SyncLog" ADD COLUMN IF NOT EXISTS "integrationType" VARCHAR(50);
ALTER TABLE "SyncLog" ADD COLUMN IF NOT EXISTS "initiatedBy" TEXT;
ALTER TABLE "SyncLog" ADD COLUMN IF NOT EXISTS "metadata" JSONB NOT NULL DEFAULT '{}';

-- Set default for integrationType for existing rows (if any)
UPDATE "SyncLog" SET "integrationType" = 'unknown' WHERE "integrationType" IS NULL;

-- Now make integrationType NOT NULL after populating existing rows
ALTER TABLE "SyncLog" ALTER COLUMN "integrationType" SET NOT NULL;

-- Add missing indexes (IF NOT EXISTS for idempotency)
CREATE INDEX IF NOT EXISTS "SyncLog_companyId_startedAt_idx" ON "SyncLog"("companyId", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS "SyncLog_integrationType_status_idx" ON "SyncLog"("integrationType", status);

-- Add foreign key constraint (use DO block to check if constraint exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'SyncLog_companyId_fkey'
    ) THEN
        ALTER TABLE "SyncLog" ADD CONSTRAINT "SyncLog_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
