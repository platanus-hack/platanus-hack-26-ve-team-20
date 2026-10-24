// Límite de intentos (P1) apoyado en AuditLog: no hace falta otra tabla, y cada intento queda
// registrado de todos modos. Sirve para el login de admin y para el portal por cédula (F11).
// Trade-off: cuenta filas en cada petición; con el volumen de la demo es despreciable (hay índice
// en action + createdAt).
import type { PrismaClient } from "../generated/prisma/client.ts";
import { audit, type AuditEntry } from "./audit.ts";
import { DomainError } from "./errors.ts";

export class RateLimitedError extends DomainError {
  constructor(message = "Demasiados intentos. Espere unos minutos e intente de nuevo.") {
    super("RATE_LIMITED", message);
  }
}

export interface LimitRule {
  /** Acción del AuditLog que se cuenta, p. ej. "ADMIN_LOGIN_FAILED". */
  action: string;
  /** Cuenta solo las filas de esta IP. */
  ip?: string | null | undefined;
  /** Cuenta solo las filas de esta entidad (p. ej. huella del correo). */
  entityId?: string | undefined;
  max: number;
  windowMs: number;
}

export function countRecent(db: Pick<PrismaClient, "auditLog">, rule: Omit<LimitRule, "max">, now: Date = new Date()): Promise<number> {
  return db.auditLog.count({
    where: {
      action: rule.action,
      createdAt: { gt: new Date(now.getTime() - rule.windowMs) },
      ...(rule.ip && { ip: rule.ip }),
      ...(rule.entityId && { entityId: rule.entityId }),
    },
  });
}

/** Lanza `RateLimitedError` (429) si ya se alcanzó el máximo en la ventana. */
export async function assertUnderLimit(db: Pick<PrismaClient, "auditLog">, rule: LimitRule, now: Date = new Date()): Promise<void> {
  if ((await countRecent(db, rule, now)) >= rule.max) throw new RateLimitedError();
}

/**
 * Comprueba VARIAS reglas y registra UNA entrada de auditoría en un solo paso atómico: bloquea todas las
 * claves (en orden, para no provocar interbloqueos) dentro de una transacción, lanza `RateLimitedError`
 * si alguna regla ya está en su máximo y, si no, escribe `entry`. Al contar y registrar bajo el mismo
 * bloqueo, las peticiones simultáneas no pueden pasarse del límite. Las bloqueadas no se registran: la
 * ventana no se alarga por insistir.
 */
export async function consumeLimits(
  db: PrismaClient,
  rules: Array<LimitRule & { lockKey: string }>,
  entry: AuditEntry,
  now: Date = new Date(),
): Promise<void> {
  await db.$transaction(async (tx) => {
    for (const key of [...new Set(rules.map((r) => r.lockKey))].sort()) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    }
    for (const rule of rules) await assertUnderLimit(tx, rule, now);
    await audit(tx, entry);
  }, { maxWait: 10_000, timeout: 20_000 });
}

/** Una sola regla: ver {@link consumeLimits}. */
export function consumeLimit(
  db: PrismaClient,
  rule: LimitRule & { lockKey: string },
  entry: AuditEntry,
  now: Date = new Date(),
): Promise<void> {
  return consumeLimits(db, [rule], entry, now);
}
