-- AlterTable
ALTER TABLE "SiteInspection" ADD COLUMN     "evidenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
