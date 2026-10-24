// Webhook de la WhatsApp Cloud API (docs/04 §7, docs/p3-plan-de-trabajo.md §3.4).
// - GET: verificación de la URL (hub.mode / hub.verify_token / hub.challenge).
// - POST: firma X-Hub-Signature-256 sobre el body crudo y estados de entrega por wamid.
// La lógica HTTP vive aquí (testeable); api/webhooks/whatsapp.ts solo la conecta.
// Nunca se loguean teléfonos ni textos de mensajes.
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ERROR_HTTP_STATUS, type ApiResponse, type ErrorCode, type NotificationStatus } from "../contracts/index.ts";

// ---------------------------------------------------------------- verificación

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Devuelve `hub.challenge` si Meta mandó el verify token correcto; si no, `null`. */
export function verifyWebhookChallenge(params: URLSearchParams, verifyToken: string): string | null {
  const challenge = params.get("hub.challenge");
  const token = params.get("hub.verify_token") ?? "";
  if (!verifyToken || params.get("hub.mode") !== "subscribe" || !challenge) return null;
  return safeEqual(token, verifyToken) ? challenge : null;
}

/** `X-Hub-Signature-256: sha256=<hex>` = HMAC-SHA256(body crudo, clave secreta de la app). */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!appSecret || !signatureHeader) return false;
  const match = /^sha256=([0-9a-f]{64})$/i.exec(signatureHeader.trim());
  if (!match?.[1]) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return safeEqual(match[1].toLowerCase(), expected);
}

// ---------------------------------------------------------------- payload

export interface WebhookStatusEvent {
  /** wamid; es `Notification.providerId`. */
  providerId: string;
  status: Exclude<NotificationStatus, "QUEUED" | "DRY_RUN">;
  at: Date;
  callbackData?: string;
  /** Código y título del primer error, para `Notification.error`. */
  error?: string;
}

export interface WebhookInboundMessage {
  id: string;
  /** Teléfono de quien escribió (puede faltar si Meta manda solo un id de usuario). */
  from?: string;
  at: Date;
  text?: string;
}

const META_TO_STATUS = { sent: "SENT", delivered: "DELIVERED", read: "READ", failed: "FAILED" } as const;

const StatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["sent", "delivered", "read", "failed"]),
  timestamp: z.string().regex(/^\d+$/),
  biz_opaque_callback_data: z.string().optional(),
  errors: z.array(z.object({ code: z.number(), title: z.string().optional(), message: z.string().optional() })).optional(),
});

const InboundSchema = z.object({
  id: z.string().min(1),
  from: z.string().optional(),
  timestamp: z.string().regex(/^\d+$/),
  text: z.object({ body: z.string() }).optional(),
});

const EnvelopeSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          field: z.string(),
          value: z.object({ statuses: z.array(z.unknown()).optional(), messages: z.array(z.unknown()).optional() }),
        }),
      ),
    }),
  ),
});

const fromUnixSeconds = (seconds: string) => new Date(Number(seconds) * 1000);

/** Extrae estados y mensajes entrantes. Un elemento raro se ignora sin descartar el resto del lote. */
export function parseWebhookPayload(payload: unknown): { statuses: WebhookStatusEvent[]; messages: WebhookInboundMessage[] } | null {
  const envelope = EnvelopeSchema.safeParse(payload);
  if (!envelope.success || envelope.data.object !== "whatsapp_business_account") return null;

  const statuses: WebhookStatusEvent[] = [];
  const messages: WebhookInboundMessage[] = [];
  for (const entry of envelope.data.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;
      for (const raw of change.value.statuses ?? []) {
        const s = StatusSchema.safeParse(raw);
        if (!s.success) continue;
        const firstError = s.data.errors?.[0];
        statuses.push({
          providerId: s.data.id,
          status: META_TO_STATUS[s.data.status],
          at: fromUnixSeconds(s.data.timestamp),
          ...(s.data.biz_opaque_callback_data ? { callbackData: s.data.biz_opaque_callback_data } : {}),
          ...(firstError ? { error: `${firstError.code}: ${firstError.title ?? firstError.message ?? "error de Meta"}` } : {}),
        });
      }
      for (const raw of change.value.messages ?? []) {
        const m = InboundSchema.safeParse(raw);
        if (!m.success) continue;
        messages.push({
          id: m.data.id,
          at: fromUnixSeconds(m.data.timestamp),
          ...(m.data.from ? { from: m.data.from } : {}),
          ...(m.data.text ? { text: m.data.text.body } : {}),
        });
      }
    }
  }
  return { statuses, messages };
}

// ---------------------------------------------------------------- estados

const RANK: Record<NotificationStatus, number> = { QUEUED: 0, DRY_RUN: 0, FAILED: 0, SENT: 1, DELIVERED: 2, READ: 3 };

/**
 * Estado al que pasa una Notification con un evento de Meta, o `null` si el evento no cambia nada.
 * Nunca baja de estado (un `delivered` atrasado no pisa un `read`), así que los reintentos de Meta
 * son idempotentes. `FAILED` solo aplica antes de la entrega; un `DRY_RUN` no cambia nunca.
 */
export function nextNotificationStatus(
  current: NotificationStatus,
  incoming: WebhookStatusEvent["status"],
): NotificationStatus | null {
  if (current === "DRY_RUN" || current === incoming) return null;
  if (incoming === "FAILED") return current === "QUEUED" || current === "SENT" ? "FAILED" : null;
  return RANK[incoming] > RANK[current] ? incoming : null;
}

/** Dónde se guardan los estados. En producción: webhook-store.ts (Prisma), que usa nextNotificationStatus. */
export interface NotificationStatusStore {
  apply(event: WebhookStatusEvent): Promise<"UPDATED" | "UNCHANGED" | "NOT_FOUND">;
}

/** Store que no guarda nada (todo queda como NOT_FOUND); valor por defecto de webhookConfigFromEnv. */
export const logOnlyStatusStore: NotificationStatusStore = {
  async apply() {
    return "NOT_FOUND";
  },
};

// ---------------------------------------------------------------- HTTP

export interface WebhookConfig {
  appSecret: string;
  verifyToken: string;
  store: NotificationStatusStore;
}

export function webhookConfigFromEnv(store: NotificationStatusStore = logOnlyStatusStore): WebhookConfig {
  return {
    appSecret: process.env.WHATSAPP_APP_SECRET ?? "",
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
    store,
  };
}

function json<T>(body: ApiResponse<T>, status = 200): Response {
  return Response.json(body, { status });
}

function jsonError(code: ErrorCode, message: string): Response {
  return json({ ok: false, error: { code, message } }, ERROR_HTTP_STATUS[code]);
}

export function handleWebhookGet(request: Request, config: Pick<WebhookConfig, "verifyToken">): Response {
  const challenge = verifyWebhookChallenge(new URL(request.url).searchParams, config.verifyToken);
  return challenge === null
    ? new Response("Forbidden", { status: 403, headers: { "Content-Type": "text/plain" } })
    : new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export interface WebhookPostResult {
  statuses: number;
  updated: number;
  unchanged: number;
  notFound: number;
  messages: number;
}

export async function handleWebhookPost(request: Request, config: WebhookConfig): Promise<Response> {
  if (!config.appSecret) return jsonError("INTERNAL_ERROR", "Webhook sin configurar");

  const rawBody = await request.text();
  if (!verifyWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"), config.appSecret)) {
    return jsonError("UNAUTHORIZED", "Firma inválida");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonError("VALIDATION_ERROR", "Body no es JSON");
  }
  const parsed = parseWebhookPayload(payload);
  if (!parsed) return jsonError("VALIDATION_ERROR", "No es un evento de WhatsApp Business");

  const result: WebhookPostResult = {
    statuses: parsed.statuses.length,
    updated: 0,
    unchanged: 0,
    notFound: 0,
    messages: parsed.messages.length,
  };
  try {
    for (const event of parsed.statuses) {
      const outcome = await config.store.apply(event);
      if (outcome === "UPDATED") result.updated++;
      else if (outcome === "UNCHANGED") result.unchanged++;
      else result.notFound++;
    }
  } catch (err) {
    // 500 para que Meta reintente; el detalle va al log sin datos personales
    console.error("[webhooks/whatsapp] no se pudo guardar un estado", err instanceof Error ? err.message : err);
    return jsonError("INTERNAL_ERROR", "Error interno");
  }
  return json({ ok: true, data: result });
}
