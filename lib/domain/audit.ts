// Auditoría (P1): toda acción de dominio que cambia estado o consulta datos sensibles escribe un
// `AuditLog`. Recibe el cliente de Prisma (o una transacción) para poder escribirse en la MISMA
// transacción que el cambio auditado.
import type { ActorType } from "../contracts/index.ts";
import type { AuditLog, Prisma } from "../generated/prisma/client.ts";

export interface Actor {
  type: ActorType;
  id?: string | null;
  ip?: string | null;
}

export const SYSTEM_ACTOR: Actor = { type: "SYSTEM" };

export interface AuditEntry {
  actor: Actor;
  /** p. ej. "VIOLATION_TRANSITION", "PORTAL_LOOKUP". */
  action: string;
  /** p. ej. "Violation", "Fine". */
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

type AuditClient = Pick<Prisma.TransactionClient, "auditLog">;

export function audit(client: AuditClient, entry: AuditEntry): Promise<AuditLog> {
  const json = (v: unknown) => (v === undefined || v === null ? undefined : (v as Prisma.InputJsonValue));
  return client.auditLog.create({
    data: {
      actorType: entry.actor.type,
      actorId: entry.actor.id ?? null,
      ip: entry.actor.ip ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      before: json(entry.before),
      after: json(entry.after),
    },
  });
}
