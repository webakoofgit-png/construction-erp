-- CreateEnum
CREATE TYPE "DailyWorkPlanStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED');

-- CreateTable
CREATE TABLE "DailyWorkPlan" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "workType" TEXT,
    "planDate" DATE NOT NULL,
    "labourPlanned" INTEGER NOT NULL DEFAULT 0,
    "completionPercent" INTEGER NOT NULL DEFAULT 0,
    "status" "DailyWorkPlanStatus" NOT NULL DEFAULT 'PLANNED',
    "notes" TEXT,
    "projectId" TEXT NOT NULL,
    "projectSiteId" TEXT NOT NULL,
    "projectTaskId" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyWorkPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyWorkPlan_organizationId_planDate_idx" ON "DailyWorkPlan"("organizationId", "planDate");

-- CreateIndex
CREATE INDEX "DailyWorkPlan_projectSiteId_planDate_idx" ON "DailyWorkPlan"("projectSiteId", "planDate");

-- AddForeignKey
ALTER TABLE "DailyWorkPlan" ADD CONSTRAINT "DailyWorkPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWorkPlan" ADD CONSTRAINT "DailyWorkPlan_projectSiteId_fkey" FOREIGN KEY ("projectSiteId") REFERENCES "ProjectSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWorkPlan" ADD CONSTRAINT "DailyWorkPlan_projectTaskId_fkey" FOREIGN KEY ("projectTaskId") REFERENCES "ProjectTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWorkPlan" ADD CONSTRAINT "DailyWorkPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
