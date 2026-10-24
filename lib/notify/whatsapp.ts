// Cliente de la WhatsApp Cloud API de Meta (docs/04 §7, docs/p3-plan-de-trabajo.md §3.4).
// Solo mensajes `type: "text"` desde el número de prueba, dentro de la ventana de 24 h.
// Nunca lanza: todo fallo vuelve como `{ status: "FAILED", error }` para guardarlo en Notification.
// Nunca loguea el token ni el cuerpo del mensaje.
import { z } from "zod";

const DEFAULT_GRAPH_VERSION = "v23.0";
const TIMEOUT_MS = 10_000;

// Códigos de error de Meta que importan en la demo (confirmar con el primer fallo real).
const WINDOW_CLOSED_CODE = 131047; // pasaron más de 24 h desde el último mensaje del destinatario
const RECIPIENT_NOT_ALLOWED_CODE = 131030; // el número de prueba solo envía a destinatarios verificados

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  graphVersion: string;
  dryRun: boolean;
}

export type WhatsAppErrorReason =
  | "CONFIG"
  | "INVALID_RECIPIENT"
  | "WINDOW_CLOSED"
  | "RECIPIENT_NOT_ALLOWED"
  | "META_ERROR"
  | "TIMEOUT"
  | "NETWORK"
  | "INVALID_RESPONSE";

export interface WhatsAppError {
  reason: WhatsAppErrorReason;
  message: string;
  metaCode?: number;
}

export type WhatsAppSendResult =
  | { status: "SENT"; providerId: string }
  | { status: "DRY_RUN" }
  | { status: "FAILED"; error: WhatsAppError };

export interface WhatsAppTextMessage {
  /** Teléfono en formato internacional, p. ej. `584120000001` (se aceptan `+`, espacios y guiones). */
  to: string;
  body: string;
  /** Vuelve en los webhooks de estado; p. ej. `fine:<id>`. */
  callbackData?: string;
}

const EnvSchema = z.object({
  NOTIFY_DRY_RUN: z.enum(["true", "false"]).default("true"),
  WHATSAPP_ACCESS_TOKEN: z.string().default(""),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(""),
  WHATSAPP_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).default(DEFAULT_GRAPH_VERSION),
});

/** Lee la configuración de `process.env`. Sin `NOTIFY_DRY_RUN=false` explícito, no se envía nada. */
export function whatsappConfigFromEnv(env: Record<string, string | undefined> = process.env): WhatsAppConfig {
  const e = EnvSchema.parse({
    NOTIFY_DRY_RUN: env.NOTIFY_DRY_RUN || undefined,
    WHATSAPP_ACCESS_TOKEN: env.WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID: env.WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_GRAPH_VERSION: env.WHATSAPP_GRAPH_VERSION || undefined,
  });
  return {
    accessToken: e.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: e.WHATSAPP_PHONE_NUMBER_ID,
    graphVersion: e.WHATSAPP_GRAPH_VERSION,
    dryRun: e.NOTIFY_DRY_RUN === "true",
  };
}

/** `+58 412-000-0001` → `584120000001`; `null` si no parece un número internacional. */
export function normalizeWhatsAppNumber(phone: string): string | null {
  const digits = phone.replace(/[\s+().-]/g, "");
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

/** Texto corto para `Notification.error`. */
export function describeWhatsAppError(error: WhatsAppError): string {
  return `${error.reason}${error.metaCode === undefined ? "" : ` (${error.metaCode})`}: ${error.message}`;
}

const SuccessSchema = z.object({ messages: z.array(z.object({ id: z.string().min(1) })).min(1) });
const ErrorSchema = z.object({ error: z.object({ message: z.string(), code: z.number().optional() }) });

function metaError(code: number | undefined, message: string): WhatsAppError {
  if (code === WINDOW_CLOSED_CODE) return { reason: "WINDOW_CLOSED", message, metaCode: code };
  if (code === RECIPIENT_NOT_ALLOWED_CODE) return { reason: "RECIPIENT_NOT_ALLOWED", message, metaCode: code };
  return code === undefined ? { reason: "META_ERROR", message } : { reason: "META_ERROR", message, metaCode: code };
}

export async function sendWhatsAppText(
  message: WhatsAppTextMessage,
  options: { config?: WhatsAppConfig; fetchImpl?: typeof fetch } = {},
): Promise<WhatsAppSendResult> {
  const fail = (error: WhatsAppError): WhatsAppSendResult => ({ status: "FAILED", error });

  const to = normalizeWhatsAppNumber(message.to);
  if (!to) return fail({ reason: "INVALID_RECIPIENT", message: "El destinatario no es un número internacional válido" });
  if (!message.body.trim()) return fail({ reason: "CONFIG", message: "El mensaje está vacío" });

  let config: WhatsAppConfig;
  try {
    config = options.config ?? whatsappConfigFromEnv();
  } catch {
    return fail({ reason: "CONFIG", message: "Variables de WhatsApp inválidas" });
  }
  if (config.dryRun) return { status: "DRY_RUN" };
  if (!config.accessToken || !config.phoneNumberId) {
    return fail({ reason: "CONFIG", message: "Faltan WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID" });
  }

  const url = `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body: message.body, preview_url: true },
    ...(message.callbackData ? { biz_opaque_callback_data: message.callbackData } : {}),
  };

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
    return fail(
      timedOut
        ? { reason: "TIMEOUT", message: `Meta no respondió en ${TIMEOUT_MS / 1000} s` }
        : { reason: "NETWORK", message: "No se pudo conectar con Meta" },
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return fail({ reason: "INVALID_RESPONSE", message: `Respuesta no JSON de Meta (HTTP ${response.status})` });
  }

  if (!response.ok) {
    const parsed = ErrorSchema.safeParse(json);
    return fail(
      parsed.success
        ? metaError(parsed.data.error.code, parsed.data.error.message)
        : { reason: "META_ERROR", message: `HTTP ${response.status}` },
    );
  }

  const parsed = SuccessSchema.safeParse(json);
  const first = parsed.success ? parsed.data.messages[0] : undefined;
  if (!first) return fail({ reason: "INVALID_RESPONSE", message: "Meta no devolvió el id del mensaje" });
  return { status: "SENT", providerId: first.id };
}
