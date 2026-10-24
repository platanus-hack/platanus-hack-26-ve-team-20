// Notificaciones reales por WhatsApp (HU-03, docs/04 §7): arman el texto, lo envían y lo registran
// en Notification (y AuditLog). Nunca lanzan: un fallo queda como FAILED para verse en la consola.
// Sin DB directa: todo pasa por un NotificationRepo (prisma-repo.ts en producción).
import type { NotificationResult, ViolationType } from "../contracts/index.ts";
import { fineIssuedText, paymentConfirmedText, type NotificationTemplate } from "./templates.ts";
import { describeWhatsAppError, type WhatsAppSendResult, type WhatsAppTextMessage } from "./whatsapp.ts";

export interface FineMessageData {
  /** Teléfono del dueño (Person.phone); `null` si la violación no tiene vehículo con dueño. */
  to: string | null;
  type: ViolationType;
  intersection: string;
  occurredAt: Date;
  plate: string;
  amountCents: number;
  currency: string;
  publicToken: string;
}

export interface PaymentMessageData {
  to: string | null;
  plate: string;
  /** Referencia del último pago aprobado. */
  reference: string | null;
}

export type NotificationOutcome = { status: "SENT"; providerId: string } | { status: "DRY_RUN" } | { status: "FAILED"; error: string };

export interface NotificationRepo {
  fineMessage(fineId: string): Promise<FineMessageData | null>;
  paymentMessage(fineId: string): Promise<PaymentMessageData | null>;
  /** Crea la fila en QUEUED y devuelve su id. */
  create(n: { fineId: string; to: string; template: NotificationTemplate }): Promise<string>;
  /** Guarda el resultado y escribe el AuditLog. */
  finish(notificationId: string, outcome: NotificationOutcome): Promise<void>;
}

export interface NotifierDeps {
  repo: NotificationRepo;
  send: (message: WhatsAppTextMessage) => Promise<WhatsAppSendResult>;
  appBaseUrl: string;
}

const FAILED: NotificationResult = { channel: "WHATSAPP", status: "FAILED" };

function toOutcome(result: WhatsAppSendResult): NotificationOutcome {
  if (result.status === "SENT") return { status: "SENT", providerId: result.providerId };
  if (result.status === "DRY_RUN") return { status: "DRY_RUN" };
  return { status: "FAILED", error: describeWhatsAppError(result.error) };
}

function toResult(outcome: NotificationOutcome): NotificationResult {
  return outcome.status === "SENT"
    ? { channel: "WHATSAPP", status: "SENT", providerId: outcome.providerId }
    : { channel: "WHATSAPP", status: outcome.status };
}

export function createNotifier({ repo, send, appBaseUrl }: NotifierDeps) {
  async function deliver(
    fineId: string,
    template: NotificationTemplate,
    to: string | null,
    body: string,
    callbackData: string,
  ): Promise<NotificationResult> {
    const id = await repo.create({ fineId, to: to ?? "", template });
    const outcome: NotificationOutcome = to
      ? toOutcome(await send({ to, body, callbackData }))
      : { status: "FAILED", error: "Sin teléfono del destinatario" };
    await repo.finish(id, outcome);
    return toResult(outcome);
  }

  /** Corre `fn` sin dejar escapar errores (p. ej. DB caída): el llamador recibe FAILED. */
  async function safely(label: string, fn: () => Promise<NotificationResult>): Promise<NotificationResult> {
    try {
      return await fn();
    } catch (err) {
      console.error(`[notify] ${label} falló`, err instanceof Error ? err.message : err);
      return FAILED;
    }
  }

  return {
    notifyFineIssued: (fineId: string) =>
      safely("notifyFineIssued", async () => {
        const data = await repo.fineMessage(fineId);
        if (!data) return FAILED;
        const body = fineIssuedText({ ...data, fineToken: data.publicToken, appBaseUrl });
        return deliver(fineId, "FINE_ISSUED", data.to, body, `fine:${fineId}`);
      }),

    notifyPaymentConfirmed: (fineId: string) =>
      safely("notifyPaymentConfirmed", async () => {
        const data = await repo.paymentMessage(fineId);
        if (!data?.reference) return FAILED;
        const body = paymentConfirmedText({ reference: data.reference, plate: data.plate });
        return deliver(fineId, "PAYMENT_CONFIRMED", data.to, body, `payment:${fineId}`);
      }),
  };
}

/** APP_BASE_URL; si falta, el dominio de producción que da Vercel; si no, localhost. */
export function appBaseUrlFromEnv(env: Record<string, string | undefined> = process.env): string {
  if (env.APP_BASE_URL) return env.APP_BASE_URL;
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}
