// Cuenta de admin inicial. El correo y la contraseña NUNCA van en el repo: entran por ADMIN_EMAIL y
// ADMIN_PASSWORD (entorno). Solo se guarda el hash scrypt. Idempotente: si la contraseña no cambió,
// no toca la fila (así no se cierran las sesiones abiertas); si cambió, actualiza el hash.
import { hashPassword, verifyPassword } from "../lib/auth/password.ts";
import type { PrismaClient } from "../lib/generated/prisma/client.ts";

export const SEED_ADMIN_ID = "seed_adm_1";

export type AdminSeedResult = "created" | "updated" | "unchanged" | "skipped";

export async function ensureAdmin(
  db: Pick<PrismaClient, "adminUser">,
  input: { email?: string | undefined; password?: string | undefined; name?: string | undefined; id?: string },
): Promise<AdminSeedResult> {
  const email = input.email?.trim().toLowerCase();
  if (!email || !input.password) return "skipped";

  const existing = await db.adminUser.findUnique({ where: { email } });
  if (existing) {
    if (await verifyPassword(input.password, existing.passwordHash)) {
      if (!existing.active) await db.adminUser.update({ where: { id: existing.id }, data: { active: true } });
      return existing.active ? "unchanged" : "updated";
    }
    await db.adminUser.update({ where: { id: existing.id }, data: { passwordHash: await hashPassword(input.password), active: true } });
    return "updated";
  }

  await db.adminUser.create({
    data: { id: input.id ?? SEED_ADMIN_ID, email, name: input.name?.trim() || "Administrador", passwordHash: await hashPassword(input.password) },
  });
  return "created";
}
