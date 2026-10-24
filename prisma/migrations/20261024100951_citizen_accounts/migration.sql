-- CreateTable
CREATE TABLE "CitizenAccount" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "CitizenAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CitizenRegistration" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "email" TEXT,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CitizenRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CitizenAccount_personId_key" ON "CitizenAccount"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "CitizenRegistration_personId_key" ON "CitizenRegistration"("personId");

-- AddForeignKey
ALTER TABLE "CitizenAccount" ADD CONSTRAINT "CitizenAccount_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CitizenRegistration" ADD CONSTRAINT "CitizenRegistration_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row Level Security (docs/11 F4): Supabase expone `public` por REST; estas tablas guardan hashes de contraseña y códigos.
ALTER TABLE "CitizenAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CitizenRegistration" ENABLE ROW LEVEL SECURITY;
