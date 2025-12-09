-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('pending', 'resolved', 'verified', 'changes_requested');

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "githubIssueNumber" INTEGER NOT NULL,
    "githubIssueUrl" VARCHAR(500) NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'pending',
    "notificationSentAt" TIMESTAMP(3),
    "notificationMessageId" VARCHAR(255),
    "responseReceivedAt" TIMESTAMP(3),
    "responseEmailId" VARCHAR(255),
    "responseContent" TEXT,
    "followUpIssueNumber" INTEGER,
    "followUpIssueUrl" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMonitorState" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "lastCheckTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailMonitorState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_githubIssueNumber_key" ON "Feedback"("githubIssueNumber");

-- CreateIndex
CREATE INDEX "Feedback_status_idx" ON "Feedback"("status");

-- CreateIndex
CREATE INDEX "Feedback_githubIssueNumber_idx" ON "Feedback"("githubIssueNumber");

-- CreateIndex
CREATE INDEX "Feedback_userId_idx" ON "Feedback"("userId");

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
