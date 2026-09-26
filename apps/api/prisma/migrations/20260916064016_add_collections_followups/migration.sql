-- CreateTable
CREATE TABLE "CollectionFollowUp" (
    "id" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "nextFollowUpAt" DATE,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "clientBillId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CollectionFollowUp_organizationId_status_idx" ON "CollectionFollowUp"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "CollectionFollowUp" ADD CONSTRAINT "CollectionFollowUp_clientBillId_fkey" FOREIGN KEY ("clientBillId") REFERENCES "ClientBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionFollowUp" ADD CONSTRAINT "CollectionFollowUp_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
