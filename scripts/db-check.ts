// `pnpm db:check`: comprueba la conexión, lista las tablas de `public` y su estado de RLS.
// Sale con código 1 si falla la conexión o si alguna tabla no tiene RLS activado.
try {
  process.loadEnvFile(".env.local");
} catch {
  // sin .env.local: se usan las variables del entorno
}

// Import dinámico: lib/db.ts lee DATABASE_URL al cargarse, así que el entorno debe estar listo antes.
const { db } = await import("../lib/db.ts");

interface TableRow { table_name: string; rls: boolean }

const rows = await db.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`;
const connected = rows[0]?.ok === 1;
console.log(`conexión: ${connected ? "OK" : "FALLÓ"}`);

const tables = await db.$queryRaw<TableRow[]>`
  SELECT c.relname AS table_name, c.relrowsecurity AS rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  ORDER BY c.relname`;

for (const t of tables) console.log(`${t.rls ? "RLS ✓" : "RLS ✗"}  ${t.table_name}`);
console.log(`${tables.length} tablas en public`);

// Consulta tipada con el cliente generado: valida adaptador + schema de extremo a extremo.
console.log(`Camera: ${await db.camera.count()} filas`);

await db.$disconnect();
process.exit(connected && tables.every((t) => t.rls) ? 0 : 1);
