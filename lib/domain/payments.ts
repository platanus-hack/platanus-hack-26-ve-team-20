// markFinePaid (P1): lo llama P3 (`POST /api/payments/c2p`) cuando el pago simulado queda APPROVED.
// Marca Fine y Violation como PAID dentro de una transacción, con la fila bloqueada: dos pagos
// simultáneos de la misma multa se serializan y el segundo recibe ALREADY_PAID (409), nunca un
// doble cobro. El comprobante y el WhatsApp de confirmación los maneja P3.
import type { MarkFinePaid } from "../contracts/index.ts";
import type { PrismaClient } from "../generated/prisma/client.ts";
import type { Actor } from "./audit.ts";
import { DomainError, NotFoundError } from "./errors.ts";
import { transition } from "./state-machine.ts";

const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

export function createMarkFinePaid(db: PrismaClient): MarkFinePaid {
  return (fineId, paymentId) =>
    db.$transaction(async (tx) => {
      const found = await tx.fine.findUnique({ where: { id: fineId }, select: { violationId: true } });
      if (!found) throw new NotFoundError("Multa", fineId);

      // Bloquea la violación antes de leer el estado: así los pagos concurrentes hacen cola.
      await tx.$queryRaw`SELECT "id" FROM "Violation" WHERE "id" = ${found.violationId} FOR UPDATE`;

      const fine = await tx.fine.findUniqueOrThrow({ where: { id: fineId } });
      if (fine.status === "PAID") throw new DomainError("ALREADY_PAID", "Esta multa ya fue pagada");

      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment) throw new NotFoundError("Pago", paymentId);
      if (payment.fineId !== fineId) throw new DomainError("VALIDATION_ERROR", "El pago no corresponde a esta multa");
      if (payment.status !== "APPROVED") throw new DomainError("VALIDATION_ERROR", "El pago no está aprobado");

      // La máquina de estados valida (solo FINED/NOTIFIED pueden pasar a PAID), sincroniza la multa
      // con `paidAt` y audita. No se registra cédula ni teléfono del pagador: solo el id del pago.
      const actor: Actor = { type: "CITIZEN", id: `payment:${paymentId}` };
      await transition(tx, fine.violationId, "PAID", actor);
    }, TX_OPTIONS);
}
