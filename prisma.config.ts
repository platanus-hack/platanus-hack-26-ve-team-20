import { defineConfig } from "prisma/config";

// Prisma CLI no lee .env.local por sí solo: se carga aquí (Node ≥ 20.12). En Vercel las
// variables ya vienen del entorno y el archivo no existe.
try {
  process.loadEnvFile(".env.local");
} catch {
  // sin .env.local: se usan las variables del entorno
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // El CLI (migrate/db) usa la conexión directa; el runtime usa DATABASE_URL en lib/db.ts.
    url: process.env["DIRECT_URL"],
  },
});
