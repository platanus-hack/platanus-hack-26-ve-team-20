// Pago de una multa con Pago Móvil C2P SIMULADO (docs/04 §5, HU-04). Sin DB directa: todo pasa por
// un PaymentStore (prisma-store.ts en producción, uno en memoria en los tests).
// Reglas: misma idempotencyKey = mismo resultado sin cobrar de nuevo; multa pagada = 409 ALREADY_PAID;
// la clave C2P nunca se guarda, se loguea ni se devuelve.
import type { Actor } from "../domain/audit.ts";
import {
  isExampleBank,
  type C2PPaymentDTO,
  type C2PRequest,
  type ChargeC2P,
  type ErrorCode,
  type FineStatus,
  type NotifyPaymentConfirmed,
  type PaymentStatus,
} from "../contracts/index.ts";

export interface StoredPayment {
  id: string;
  fineId: string;
  status: PaymentStatus;
  reference: string | null;
  failureCode: string | null;
  /** `Fine.paidAt` de la multa del pago (para repetir la respuesta aprobada). */
  finePaidAt: Date | null;
}

export interface PayableFine {
  id: string;
  violationId: string;
  status: FineStatus;
  amountCents: number;
}

export interface NewPayment {
  fineId: string;
  idempotencyKey: string;
  payerBankCode: string;
  payerPhone: string;
  payerCedula: string;
  amountCents: number;
}

export interface PaymentStore {
  findPaymentByKey(idempotencyKey: string): Promise<StoredPayment | null>;
  findFineByToken(publicToken: string): Promise<PayableFine | null>;
  /** Crea el Payment en PENDING; `DUPLICATE_KEY` si otra petición ya usó la llave. */
  createPendingPayment(payment: NewPayment): Promise<{ id: string } | "DUPLICATE_KEY">;
  markRejected(paymentId: string, failureCode: string, actor: Actor): Promise<void>;
  /**
   * En una transacción: pasa la violación a PAID (máquina de estados de P1, con bloqueo de fila)
   * y aprueba el Payment. Si la multa ya no se puede pagar, rechaza el Payment y lo dice.
   */
  markApproved(
    paymentId: string,
    fine: PayableFine,
    reference: string,
    actor: Actor,
  ): Promise<{ paidAt: Date } | "ALREADY_PAID" | "NOT_PAYABLE">;
}

export interface PayFineDeps {
  store: PaymentStore;
  charge: ChargeC2P;
  notifyPaymentConfirmed: NotifyPaymentConfirmed;
}

export type PayFineResult = { kind: "ok"; data: C2PPaymentDTO } | { kind: "error"; code: ErrorCode; message: string };

const fail = (code: ErrorCode, message: string): PayFineResult => ({ kind: "error", code, message });

function replay(payment: StoredPayment, fineId: string): PayFineResult {
  if (payment.fineId !== fineId) return fail("CONFLICT", "Esta llave de pago ya se usó para otra multa");
  if (payment.status === "APPROVED" && payment.reference) {
    return {
      kind: "ok",
      data: {
        status: "APPROVED",
        reference: payment.reference,
        paidAt: (payment.finePaidAt ?? new Date()).toISOString(),
        simulated: true,
      },
    };
  }
  if (payment.status === "REJECTED") {
    return { kind: "ok", data: { status: "REJECTED", failureCode: payment.failureCode ?? "REJECTED", simulated: true } };
  }
  return fail("CONFLICT", "Este pago todavía se está procesando");
}

export async function payFine(req: C2PRequest, actor: Actor, deps: PayFineDeps): Promise<PayFineResult> {
  if (!isExampleBank(req.payerBankCode)) return fail("VALIDATION_ERROR", "payerBankCode: banco no admitido");

  const fine = await deps.store.findFineByToken(req.fineToken);
  if (!fine) return fail("NOT_FOUND", "Multa no encontrada");

  const previous = await deps.store.findPaymentByKey(req.idempotencyKey);
  if (previous) return replay(previous, fine.id);

  if (fine.status === "PAID") return fail("ALREADY_PAID", "Esta multa ya fue pagada");
  if (fine.status !== "PENDING" && fine.status !== "OVERDUE") return fail("CONFLICT", "Esta multa no admite pagos");

  const created = await deps.store.createPendingPayment({
    fineId: fine.id,
    idempotencyKey: req.idempotencyKey,
    payerBankCode: req.payerBankCode,
    payerPhone: req.payerPhone,
    payerCedula: req.payerCedula,
    amountCents: fine.amountCents,
  });
  if (created === "DUPLICATE_KEY") {
    const winner = await deps.store.findPaymentByKey(req.idempotencyKey);
    return winner ? replay(winner, fine.id) : fail("CONFLICT", "Este pago todavía se está procesando");
  }

  const charged = await deps.charge(req);
  if (charged.status === "REJECTED" || !charged.reference) {
    const failureCode = charged.failureCode ?? "REJECTED";
    await deps.store.markRejected(created.id, failureCode, actor);
    return { kind: "ok", data: { status: "REJECTED", failureCode, simulated: true } };
  }

  const approved = await deps.store.markApproved(created.id, fine, charged.reference, actor);
  if (approved === "ALREADY_PAID") return fail("ALREADY_PAID", "Esta multa ya fue pagada");
  if (approved === "NOT_PAYABLE") return fail("CONFLICT", "Esta multa no admite pagos");

  // nunca lanza: si el WhatsApp falla queda en Notification, el pago ya está hecho
  await deps.notifyPaymentConfirmed(fine.id);
  return {
    kind: "ok",
    data: { status: "APPROVED", reference: charged.reference, paidAt: approved.paidAt.toISOString(), simulated: true },
  };
}
