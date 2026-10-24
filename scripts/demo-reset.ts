// `pnpm demo:reset [--dry-run] [--all]`: deja la base lista para repetir la demo.
//
// Hay UNA sola base (Supabase) para desarrollo, demo y producción, así que el alcance es estrecho:
//  - Borra solo filas que NO son del seed (id sin prefijo `seed_`), es decir, lo generado por la demo.
//  - Por defecto solo las creadas HOY (hora de Caracas). `--all` las borra de cualquier fecha.
//  - Nunca toca filas sembradas: las vuelve a aplicar con upsert (restaura estados de multas y
//    violaciones, y renueva la posición de los oficiales).
//  - `--dry-run` muestra qué borraría sin modificar nada.
try {
  process.loadEnvFile(".env.local");
} catch {
  // sin .env.local: se usan las variables del entorno
}

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const all = args.has("--all");

const { db } = await import("../lib/db.ts");
const { buildSeed } = await import("../prisma/seed-data.ts");
const { applySeed } = await import("../prisma/seed-run.ts");

const now = new Date();
const caracasDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(now); // YYYY-MM-DD
const startOfToday = new Date(`${caracasDay}T00:00:00-04:00`);

const notSeed = { id: { not: { startsWith: "seed_" } } } as const;
const since = (field: string) => (all ? {} : { [field]: { gte: startOfToday } });

// Orden de borrado: primero lo que referencia a otras tablas.
const steps = [
  ["Notification", { ...notSeed, ...since("createdAt") }, (w: object) => db.notification.deleteMany({ where: w }), (w: object) => db.notification.count({ where: w })],
  ["Alert", { ...notSeed, ...since("createdAt") }, (w: object) => db.alert.deleteMany({ where: w }), (w: object) => db.alert.count({ where: w })],
  ["Sighting", { ...notSeed, ...since("seenAt") }, (w: object) => db.sighting.deleteMany({ where: w }), (w: object) => db.sighting.count({ where: w })],
  ["Payment", { ...notSeed, ...since("createdAt") }, (w: object) => db.payment.deleteMany({ where: w }), (w: object) => db.payment.count({ where: w })],
  ["Evidence", { ...notSeed, ...(all ? {} : { violation: { createdAt: { gte: startOfToday } } }) }, (w: object) => db.evidence.deleteMany({ where: w }), (w: object) => db.evidence.count({ where: w })],
  ["Fine", { ...notSeed, ...since("issuedAt") }, (w: object) => db.fine.deleteMany({ where: w }), (w: object) => db.fine.count({ where: w })],
  ["Violation", { ...notSeed, ...since("createdAt") }, (w: object) => db.violation.deleteMany({ where: w }), (w: object) => db.violation.count({ where: w })],
  ["LightChange", { ...notSeed, ...since("at") }, (w: object) => db.lightChange.deleteMany({ where: w }), (w: object) => db.lightChange.count({ where: w })],
  ["OfficerLocation", { ...notSeed, ...since("recordedAt") }, (w: object) => db.officerLocation.deleteMany({ where: w }), (w: object) => db.officerLocation.count({ where: w })],
  ["AuditLog", { ...notSeed, ...since("createdAt") }, (w: object) => db.auditLog.deleteMany({ where: w }), (w: object) => db.auditLog.count({ where: w })],
] as const;

console.log(`demo:reset ${dryRun ? "(dry-run) " : ""}— alcance: ${all ? "todo lo no sembrado" : `no sembrado creado desde ${startOfToday.toISOString()} (hoy, Caracas)`}`);

try {
  for (const [name, where, del, count] of steps) {
    if (dryRun) {
      console.log(`  ${name}: ${await count(where)} filas a borrar`);
    } else {
      const { count: n } = await del(where);
      console.log(`  ${name}: ${n} borradas`);
    }
  }

  if (dryRun) {
    console.log("dry-run: no se modificó nada.");
  } else {
    const counts = await applySeed(
      db,
      buildSeed({
        now,
        driverPhone: process.env["DEMO_PHONE_DRIVER"] || undefined,
        officerPhone: process.env["DEMO_PHONE_OFFICER"] || undefined,
      }),
    );
    console.log("seed reaplicado:", counts);
  }
} finally {
  await db.$disconnect();
}
