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
const { ensureAdmin } = await import("./seed-admin.ts");

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
  const admin = await ensureAdmin(db, {
    email: process.env["ADMIN_EMAIL"],
    password: process.env["ADMIN_PASSWORD"],
    name: process.env["ADMIN_NAME"],
  });
  console.log(admin === "skipped" ? "admin: sin ADMIN_EMAIL/ADMIN_PASSWORD, no se crea cuenta" : `admin: ${admin}`);
  const { buildDemoCitizen, applyDemoCitizen, formatDemoCitizen } = await import("./seed-demo-citizen.ts");
  const citizen = buildDemoCitizen({ cedula: process.env["DEMO_CEDULA"], phone: process.env["DEMO_PHONE_DRIVER"] || undefined, now: new Date() });
  const lines = citizen
    ? formatDemoCitizen(await applyDemoCitizen(db, citizen), process.env["APP_BASE_URL"] || "http://localhost:5173")
    : [process.env["DEMO_CEDULA"] ? "demo: DEMO_CEDULA no tiene forma de cédula; no se siembra" : "demo: sin DEMO_CEDULA, no se crea ciudadano de la demo"];
  for (const line of lines) console.log(line);
} finally {
  await db.$disconnect();
}
