-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InspectionStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "InspectionStatus" ADD VALUE 'VERIFIED';

-- AlterTable
ALTER TABLE "SiteInspection" ADD COLUMN     "correctiveEvidenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "correctiveOwner" TEXT;
