// Revisión humana (P1, HU-07 / docs/04 §2): el operador aprueba (→ multa y aviso) o anula una
// violación de la cola `/admin/revision`. Toda decisión pasa por `transition()` y queda en el
// AuditLog con el operador como actor.
//
// APPROVE solo desde NEEDS_REVIEW. Toda la aprobación (comprobar el estado, resolver el vehículo,
// REVIEWED, crear la multa y FINED) es UNA transacción con la fila bloqueada: dos operadores
// aprobando a la vez no pueden crear dos multas (el segundo recibe INVALID_TRANSITION, 409). El aviso
// al conductor va DESPUÉS de confirmar, igual que en `registerDetection`.
// No se despacha alerta a oficiales al aprobar: la detección ocurrió hace minutos y la alerta,
// por cercanía, ya no sería útil.
import {
  isPlausiblePlate,
  normalizePlate,
  type NotifyFineIssued,
  type ReviewRequest,
  type ReviewResultDTO,
} from "../contracts/index.ts";
import type { PrismaClient } from "../generated/prisma/client.ts";
import type { Actor } from "./audit.ts";
import { DomainError, InvalidTransitionError, NotFoundError } from "./errors.ts";
import { createFine } from "./fines.ts";
import { transition } from "./state-machine.ts";
import { notifyAndAdvance } from "./violations.ts";

const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

export interface ReviewDeps {
  db: PrismaClient;
  notifyFineIssued: NotifyFineIssued;
}

export type ReviewViolation = (violationId: string, input: ReviewRequest, actor: Actor) => Promise<ReviewResultDTO>;

export function createReviewViolation(deps: ReviewDeps): ReviewViolation {
  const { db } = deps;

  async function approve(violationId: string, input: Extract<ReviewRequest, { action: "APPROVE" }>, actor: Actor) {
    const fineId = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Violation" WHERE "id" = ${violationId} FOR UPDATE`;
      const v = await tx.violation.findUnique({ where: { id: violationId }, include: { fine: true } });
      if (!v) throw new NotFoundError("Violación", violationId);
      if (v.status !== "NEEDS_REVIEW") throw new InvalidTransitionError(v.status, "REVIEWED");

      // Sin vehículo conocido no hay a quién multar ni a quién avisar.
      let vehicleId = v.vehicleId;
      let correctedPlate: string | undefined;
      if (input.plate) {
        const plate = normalizePlate(input.plate);
        if (!isPlausiblePlate(plate)) throw new DomainError("VALIDATION_ERROR", "La placa indicada no tiene un formato válido");
        const vehicle = await tx.vehicle.findUnique({ where: { plate } });
        if (!vehicle) throw new DomainError("VALIDATION_ERROR", "La placa indicada no está registrada");
        vehicleId = vehicle.id;
        correctedPlate = plate;
      } else if (!vehicleId) {
        const read = v.plateRead ? normalizePlate(v.plateRead) : null;
        const vehicle = read && isPlausiblePlate(read) ? await tx.vehicle.findUnique({ where: { plate: read } }) : null;
        if (!vehicle) throw new DomainError("VALIDATION_ERROR", "Indique la placa de un vehículo registrado para aprobar");
        vehicleId = vehicle.id;
      }

      await transition(tx, violationId, "REVIEWED", actor, {
        vehicleId,
        ...(correctedPlate && { plateRead: correctedPlate }),
        ...(input.note && { note: input.note }),
      });
      const fine = await createFine(tx, { id: violationId, type: v.type });
      await transition(tx, violationId, "FINED", actor);
      return fine.id;
    }, TX_OPTIONS);

    const status = await notifyAndAdvance(deps, { violationId, status: "FINED" }, fineId);
    return { status, fineId } as ReviewResultDTO;
  }

  async function annul(violationId: string, input: Extract<ReviewRequest, { action: "VOID" }>, actor: Actor) {
    // Vale desde cualquier estado que la tabla de transiciones permita (también anular una multa ya emitida).
    await transition(db, violationId, "VOID", actor, { voidReason: input.reason });
    return { status: "VOID" } as ReviewResultDTO;
  }

  return (violationId, input, actor) =>
    input.action === "APPROVE" ? approve(violationId, input, actor) : annul(violationId, input, actor);
}
