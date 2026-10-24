// PaymentStore con Prisma (P1: lib/db.ts, lib/domain). El cambio a PAID va por transition() de la
// máquina de estados, que bloquea la fila de la violación: dos pagos simultáneos de la misma multa
// se serializan y el segundo ve la multa ya pagada.
import { audit } from "../domain/audit.ts";
import { InvalidTransitionError } from "../domain/errors.ts";
import { transition } from "../domain/state-machine.ts";
import { Prisma, type PrismaClient } from "../generated/prisma/client.ts";
import type { PaymentStore } from "./pay-fine.ts";

export function createPrismaPaymentStore(db: PrismaClient): PaymentStore {
  return {
    async findPaymentByKey(idempotencyKey) {
      const p = await db.payment.findUnique({ where: { idempotencyKey }, include: { fine: { select: { paidAt: true } } } });
      return p
        ? { id: p.id, fineId: p.fineId, status: p.status, reference: p.reference, failureCode: p.failureCode, finePaidAt: p.fine.paidAt }
        : null;
    },

    async findFineByToken(publicToken) {
      return db.fine.findUnique({
        where: { publicToken },
        select: { id: true, violationId: true, status: true, amountCents: true },
      });
    },

    async createPendingPayment(payment) {
      try {
        const created = await db.payment.create({ data: { ...payment, status: "PENDING" }, select: { id: true } });
        return created;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "DUPLICATE_KEY";
        throw err;
      }
    },

    async markRejected(paymentId, failureCode, actor) {
      await db.$transaction(async (tx) => {
        await tx.payment.update({ where: { id: paymentId }, data: { status: "REJECTED", failureCode } });
        await audit(tx, { actor, action: "PAYMENT_REJECTED", entity: "Payment", entityId: paymentId, after: { failureCode } });
      });
    },

    async markApproved(paymentId, fine, reference, actor) {
      return db.$transaction(async (tx) => {
        try {
          await transition(tx, fine.violationId, "PAID", actor);
        } catch (err) {
          if (!(err instanceof InvalidTransitionError)) throw err;
          // el "banco" aprobó pero la multa ya no se puede pagar: en un banco real habría reverso
          const failureCode = err.from === "PAID" ? "ALREADY_PAID" : "NOT_PAYABLE";
          await tx.payment.update({ where: { id: paymentId }, data: { status: "REJECTED", failureCode } });
          await audit(tx, { actor, action: "PAYMENT_REJECTED", entity: "Payment", entityId: paymentId, after: { failureCode } });
          return failureCode;
        }
        await tx.payment.update({ where: { id: paymentId }, data: { status: "APPROVED", reference } });
        await audit(tx, {
          actor,
          action: "PAYMENT_APPROVED",
          entity: "Payment",
          entityId: paymentId,
          after: { fineId: fine.id, reference, amountCents: fine.amountCents, method: "C2P_SIMULATED" },
        });
        const paid = await tx.fine.findUniqueOrThrow({ where: { id: fine.id }, select: { paidAt: true } });
        return { paidAt: paid.paidAt ?? new Date() };
      });
    },
  };
}
