// Prisma client singleton (P1). Prisma 7 exige un adaptador de driver: se usa `pg` contra el
// pooler de Supabase en modo transacción (DATABASE_URL, puerto 6543). Las migraciones usan DIRECT_URL
// desde prisma.config.ts. Solo se importa desde api/ y lib/ (nunca desde src/).
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) throw new Error("DATABASE_URL no está definida");
  // max pequeño: cada instancia serverless abre pocas conexiones y Supavisor agrupa el resto.
  const adapter = new PrismaPg({ connectionString, max: 3 });
  return new PrismaClient({ adapter });
}

export const db: PrismaClient = globalForPrisma.prisma ?? createClient();

// Evita abrir un cliente nuevo en cada recarga en desarrollo.
if (process.env["NODE_ENV"] !== "production") globalForPrisma.prisma = db;
