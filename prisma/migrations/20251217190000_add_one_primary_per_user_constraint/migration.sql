-- CreateIndex: Enforce one primary company per user at database level
-- This partial unique index allows multiple non-primary company assignments per user
-- but only ONE primary company per user
CREATE UNIQUE INDEX "one_primary_company_per_user" ON "UserCompany"("userId") WHERE "isPrimary" = true;
