-- CreateEnum
CREATE TYPE "CrashAlertStatus" AS ENUM ('PENDING', 'CAPTURING', 'UPLOADED', 'MISSED');

-- CreateTable
CREATE TABLE "CrashNode" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "heading" DOUBLE PRECISION NOT NULL,
    "recording" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrashNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrashIncident" (
    "id" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "radiusM" INTEGER NOT NULL,
    "centerX" DOUBLE PRECISION NOT NULL,
    "centerY" DOUBLE PRECISION NOT NULL,
    "reporterId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrashIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrashAlert" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeX" DOUBLE PRECISION NOT NULL,
    "nodeY" DOUBLE PRECISION NOT NULL,
    "nodeHeading" DOUBLE PRECISION NOT NULL,
    "distanceM" DOUBLE PRECISION NOT NULL,
    "status" "CrashAlertStatus" NOT NULL DEFAULT 'PENDING',
    "deliveredAt" TIMESTAMP(3),
    "clip" BYTEA,
    "clipType" TEXT,
    "clipT0S" DOUBLE PRECISION,
    "clipDurationS" DOUBLE PRECISION,
    "uploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrashAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrashNode_lastSeenAt_idx" ON "CrashNode"("lastSeenAt");
CREATE INDEX "CrashIncident_occurredAt_idx" ON "CrashIncident"("occurredAt");
CREATE INDEX "CrashAlert_nodeId_status_idx" ON "CrashAlert"("nodeId", "status");
CREATE UNIQUE INDEX "CrashAlert_incidentId_nodeId_key" ON "CrashAlert"("incidentId", "nodeId");

-- AddForeignKey
ALTER TABLE "CrashAlert" ADD CONSTRAINT "CrashAlert_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "CrashIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrashAlert" ADD CONSTRAINT "CrashAlert_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "CrashNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: sin políticas; solo el servidor (rol postgres vía Prisma) accede.
ALTER TABLE "CrashNode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CrashIncident" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CrashAlert" ENABLE ROW LEVEL SECURITY;
