-- AlterTable
ALTER TABLE "Officer" ADD COLUMN "email" TEXT,
ADD COLUMN "passwordHash" TEXT,
ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "OfficerInvitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "officerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfficerInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Officer_email_key" ON "Officer"("email");
CREATE UNIQUE INDEX "OfficerInvitation_tokenHash_key" ON "OfficerInvitation"("tokenHash");
CREATE UNIQUE INDEX "OfficerInvitation_officerId_key" ON "OfficerInvitation"("officerId");
CREATE INDEX "OfficerInvitation_email_idx" ON "OfficerInvitation"("email");

-- AddForeignKey
ALTER TABLE "OfficerInvitation" ADD CONSTRAINT "OfficerInvitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OfficerInvitation" ADD CONSTRAINT "OfficerInvitation_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "Officer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: sin políticas; solo el servidor (rol postgres vía Prisma) accede.
ALTER TABLE "OfficerInvitation" ENABLE ROW LEVEL SECURITY;
