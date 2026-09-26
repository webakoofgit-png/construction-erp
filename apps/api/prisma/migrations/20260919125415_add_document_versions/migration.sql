-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'SUPERSEDED');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "parentDocumentId" TEXT,
ADD COLUMN     "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "Document_organizationId_parentDocumentId_idx" ON "Document"("organizationId", "parentDocumentId");
