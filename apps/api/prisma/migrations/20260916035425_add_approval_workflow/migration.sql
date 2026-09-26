-- AlterEnum
ALTER TYPE "ContractorBillStatus" ADD VALUE 'REJECTED';

-- AlterEnum
ALTER TYPE "DailyReportStatus" ADD VALUE 'REJECTED';

-- AlterEnum
ALTER TYPE "ExpenseStatus" ADD VALUE 'REJECTED';

-- CreateTable
CREATE TABLE "ApprovalLog" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "note" TEXT,
    "actorId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApprovalLog_organizationId_idx" ON "ApprovalLog"("organizationId");

-- CreateIndex
CREATE INDEX "ApprovalLog_entityType_entityId_idx" ON "ApprovalLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "ApprovalLog" ADD CONSTRAINT "ApprovalLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
