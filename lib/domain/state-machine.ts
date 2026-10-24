// Máquina de estados de la violación (docs/03 §3). Es el ÚNICO lugar donde cambia
// `Violation.status`: valida la transición, sincroniza `Fine.status` y escribe el `AuditLog`
// en la misma transacción. Dueño: P1.
import type { FineStatus, ReviewReason, ViolationStatus } from "../contracts/index.ts";
import type { Fine, Prisma, PrismaClient, Violation } from "../generated/prisma/client.ts";
import { audit, type Actor } from "./audit.ts";
import { DomainError, InvalidTransitionError, NotFoundError } from "./errors.ts";

export const VIOLATION_TRANSITIONS: Record<ViolationStatus, readonly ViolationStatus[]> = {
  DETECTED: ["NEEDS_REVIEW", "FINED", "VOID"],
  NEEDS_REVIEW: ["REVIEWED", "VOID"],
  REVIEWED: ["FINED", "VOID"],
  FINED: ["NOTIFIED", "PAID", "APPEALED", "VOID"],
  NOTIFIED: ["PAID", "APPEALED", "VOID"],
  APPEALED: ["NOTIFIED", "VOID"], // apelación rechazada vuelve a NOTIFIED
  PAID: [],
  VOID: [],
};

export function canTransition(from: ViolationStatus, to: ViolationStatus): boolean {
  return VIOLATION_TRANSITIONS[from].includes(to);
}

/**
 * Estado que debe tener la multa cuando la violación llega a `status`, o `null` si la multa no
 * cambia. `PENDING` mientras la violación está FINED/NOTIFIED (incluye volver de una apelación).
 */
export function fineStatusFor(status: ViolationStatus): FineStatus | null {
  switch (status) {
    case "FINED":
    case "NOTIFIED":
      return "PENDING";
    case "PAID":
      return "PAID";
    case "APPEALED":
      return "APPEALED";
    case "VOID":
      return "VOID";
    default:
      return null;
  }
}

/** `OVERDUE` se calcula (dueAt vencido y aún PENDING); no se guarda ni requiere un job. */
export function effectiveFineStatus(fine: Pick<Fine, "status" | "dueAt">, now: Date = new Date()): FineStatus {
  return fine.status === "PENDING" && fine.dueAt < now ? "OVERDUE" : fine.status;
}

type Client = PrismaClient | Prisma.TransactionClient;

function isRoot(client: Client): client is PrismaClient {
  return "$transaction" in client;
}

/** Datos que pueden cambiar junto con el estado, dentro de la misma transacción. */
export interface TransitionChanges {
  reviewReason?: ReviewReason | null;
  voidReason?: string | null;
  vehicleId?: string | null;
  plateRead?: string | null;
  /** Comentario del operador: va al AuditLog, no a la violación. */
  note?: string | null;
}

/**
 * Cambia el estado de una violación.
 *
 * - `client` puede ser el cliente raíz (abre su propia transacción) o una transacción ya abierta,
 *   para componerla con otras escrituras (p. ej. crear la multa y pasar a FINED de forma atómica).
 * - La fila se bloquea (`FOR UPDATE`): dos transiciones simultáneas se serializan y la segunda se
 *   valida contra el estado ya actualizado.
 * - Lanza `NotFoundError`, `InvalidTransitionError` o `DomainError` (falta motivo).
 */
export function transition(
  client: Client,
  violationId: string,
  to: ViolationStatus,
  actor: Actor,
  changes: TransitionChanges = {},
): Promise<Violation> {
  const run = (tx: Prisma.TransactionClient) => applyTransition(tx, violationId, to, actor, changes);
  return isRoot(client) ? client.$transaction(run) : run(client);
}

async function applyTransition(
  tx: Prisma.TransactionClient,
  violationId: string,
  to: ViolationStatus,
  actor: Actor,
  changes: TransitionChanges,
): Promise<Violation> {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Violation" WHERE "id" = ${violationId} FOR UPDATE`;
  if (locked.length === 0) throw new NotFoundError("Violación", violationId);

  const current = await tx.violation.findUniqueOrThrow({ where: { id: violationId }, include: { fine: true } });
  const from = current.status;
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);

  const reviewReason = changes.reviewReason ?? current.reviewReason;
  if (to === "NEEDS_REVIEW" && !reviewReason) {
    throw new DomainError("VALIDATION_ERROR", "Pasar a NEEDS_REVIEW requiere un motivo (reviewReason)");
  }
  const voidReason = changes.voidReason ?? current.voidReason;
  if (to === "VOID" && !voidReason) {
    throw new DomainError("VALIDATION_ERROR", "Anular una violación requiere un motivo (voidReason)");
  }

  const updated = await tx.violation.update({
    where: { id: violationId },
    data: {
      status: to,
      ...(changes.reviewReason !== undefined && { reviewReason: changes.reviewReason }),
      ...(changes.voidReason !== undefined && { voidReason: changes.voidReason }),
      ...(changes.vehicleId !== undefined && { vehicleId: changes.vehicleId }),
      ...(changes.plateRead !== undefined && { plateRead: changes.plateRead }),
    },
  });

  let fineAfter: FineStatus | null = current.fine?.status ?? null;
  const nextFine = fineStatusFor(to);
  if (current.fine && nextFine && current.fine.status !== nextFine) {
    await tx.fine.update({
      where: { id: current.fine.id },
      data: { status: nextFine, ...(nextFine === "PAID" && { paidAt: current.fine.paidAt ?? new Date() }) },
    });
    fineAfter = nextFine;
  }

  await audit(tx, {
    actor,
    action: "VIOLATION_TRANSITION",
    entity: "Violation",
    entityId: violationId,
    before: { status: from, fineStatus: current.fine?.status ?? null, ...(changes.plateRead !== undefined && { plateRead: current.plateRead }) },
    after: {
      status: to,
      fineStatus: fineAfter,
      ...(changes.reviewReason !== undefined && { reviewReason: changes.reviewReason }),
      ...(changes.voidReason !== undefined && { voidReason: changes.voidReason }),
      ...(changes.plateRead !== undefined && { plateRead: changes.plateRead }),
      ...(changes.note && { note: changes.note }),
    },
  });

  return updated;
}
