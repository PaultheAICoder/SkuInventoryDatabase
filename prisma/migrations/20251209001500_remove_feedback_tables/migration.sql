-- DropForeignKey
ALTER TABLE "Feedback" DROP CONSTRAINT "Feedback_userId_fkey";

-- DropForeignKey
ALTER TABLE "FeedbackReply" DROP CONSTRAINT "FeedbackReply_feedbackId_fkey";

-- DropTable
DROP TABLE "FeedbackReply";

-- DropTable
DROP TABLE "Feedback";

-- DropEnum
DROP TYPE "FeedbackStatus";
