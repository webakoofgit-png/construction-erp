-- CreateTable
CREATE TABLE "ClientUpdateRead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dailyProgressReportId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientUpdateRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientUpdateRead_organizationId_idx" ON "ClientUpdateRead"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientUpdateRead_userId_dailyProgressReportId_key" ON "ClientUpdateRead"("userId", "dailyProgressReportId");

-- AddForeignKey
ALTER TABLE "ClientUpdateRead" ADD CONSTRAINT "ClientUpdateRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientUpdateRead" ADD CONSTRAINT "ClientUpdateRead_dailyProgressReportId_fkey" FOREIGN KEY ("dailyProgressReportId") REFERENCES "DailyProgressReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientUpdateRead" ADD CONSTRAINT "ClientUpdateRead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
