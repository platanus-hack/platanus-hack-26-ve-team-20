// `pnpm prisma db seed` (y `pnpm db:seed`): siembra datos FALSOS de ejemplo. Idempotente.
// Los únicos teléfonos reales permitidos entran por DEMO_PHONE_DRIVER / DEMO_PHONE_OFFICER.
try {
  process.loadEnvFile(".env.local");
} catch {
  // sin .env.local: se usan las variables del entorno
}

// Import dinámico: lib/db.ts lee DATABASE_URL al cargarse.
const { db } = await import("../lib/db.ts");
const { buildSeed } = await import("./seed-data.ts");
const { applySeed } = await import("./seed-run.ts");

try {
  const counts = await applySeed(
    db,
    buildSeed({
      now: new Date(),
      driverPhone: process.env["DEMO_PHONE_DRIVER"] || undefined,
      officerPhone: process.env["DEMO_PHONE_OFFICER"] || undefined,
    }),
  );
  console.log("seed aplicado:", counts);
} finally {
  await db.$disconnect();
}
