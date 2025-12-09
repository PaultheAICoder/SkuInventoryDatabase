-- DropForeignKey: Remove foreign key constraint from User.companyId to Company.id
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_companyId_fkey";

-- DropIndex: Remove index on User(companyId, isActive)
DROP INDEX IF EXISTS "User_companyId_isActive_idx";

-- AlterTable: Remove companyId column from User table
ALTER TABLE "User" DROP COLUMN IF EXISTS "companyId";
