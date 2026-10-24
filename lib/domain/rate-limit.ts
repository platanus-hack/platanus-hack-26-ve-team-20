// Límite de intentos (P1) apoyado en AuditLog: no hace falta otra tabla, y cada intento queda
// registrado de todos modos. Sirve para el login de admin y para el portal por cédula (F11).
// Trade-off: cuenta filas en cada petición; con el volumen de la demo es despreciable (hay índice
// en action + createdAt).
import type { PrismaClient } from "../generated/prisma/client.ts";
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
