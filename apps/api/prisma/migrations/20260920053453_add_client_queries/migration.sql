-- CreateEnum
CREATE TYPE "ClientQueryStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateTable
CREATE TABLE "ClientQuery" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "response" TEXT,
    "status" "ClientQueryStatus" NOT NULL DEFAULT 'OPEN',
    "dueDate" DATE,
    "projectId" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "ownerName" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientQuery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientQuery_organizationId_projectId_status_idx" ON "ClientQuery"("organizationId", "projectId", "status");

-- AddForeignKey
ALTER TABLE "ClientQuery" ADD CONSTRAINT "ClientQuery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
