// `pnpm db:migrate:pooler`: aplica prisma/migrations/*/migration.sql por DATABASE_URL (pooler de
// Supabase en modo transacción, puerto 6543) y las registra en `_prisma_migrations` con el mismo
// formato que Prisma (id, checksum sha256, nombre), así `prisma migrate deploy` las reconoce.
//
// Úsalo SOLO cuando `prisma migrate deploy` no alcanza el puerto 5432 (Session pooler / conexión
// directa), como ocurre en redes sin IPv6 o con el 5432 bloqueado. Si el 5432 funciona, usa
// `pnpm db:migrate`. No usa advisory locks: ejecútalo desde una sola máquina a la vez.
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

try {
  process.loadEnvFile(".env.local");
} catch {
  // sin .env.local: se usan las variables del entorno
}

const url = process.env["DATABASE_URL"];
if (!url) throw new Error("DATABASE_URL no está definida");

const MIGRATIONS_DIR = "prisma/migrations";

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15_000 });
await client.connect();

try {
  // Mismo DDL que crea Prisma para su tabla de control.
  await client.query(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY NOT NULL,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )`);
  await client.query(`ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY`);

  const done = new Map<string, string>();
  const rows = await client.query<{ migration_name: string; checksum: string }>(
    `SELECT migration_name, checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
  );
  for (const r of rows.rows) done.set(r.migration_name, r.checksum);

  const names = readdirSync(MIGRATIONS_DIR)
    .filter((n) => statSync(join(MIGRATIONS_DIR, n)).isDirectory())
    .sort();

  let applied = 0;
  for (const name of names) {
    const sql = readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const previous = done.get(name);
    if (previous !== undefined) {
      if (previous !== checksum) throw new Error(`La migración ${name} cambió después de aplicarse`);
      console.log(`= ${name} (ya aplicada)`);
      continue;
    }
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        `INSERT INTO "_prisma_migrations" ("id","checksum","migration_name","finished_at","applied_steps_count")
         VALUES ($1,$2,$3,now(),1)`,
        [randomUUID(), checksum, name],
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
    applied += 1;
    console.log(`+ ${name} aplicada`);
  }
  console.log(`${applied} migración(es) aplicada(s), ${names.length} en total`);
} finally {
  await client.end();
}
