// Cliente de la WhatsApp Cloud API de Meta (docs/04 §7, docs/p3-plan-de-trabajo.md §3.4).
// Solo mensajes `type: "text"` desde el número de prueba, dentro de la ventana de 24 h.
// Nunca lanza: todo fallo vuelve como `{ status: "FAILED", error }` para guardarlo en Notification.
// Nunca loguea el token ni el cuerpo del mensaje.
import { createHash } from "node:crypto";
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

/**
 * Deja solo los caracteres válidos de un token o id. Al copiar el token desde algunas apps se cuelan caracteres
 * invisibles (U+2060, espacios no separables, comillas tipográficas); en el header Authorization hacen que
 * `fetch` lance un TypeError antes de llegar a Meta. Los tokens de Meta son alfanuméricos y los ids, dígitos.
 */
export function cleanCredential(value: string | undefined, allowed: RegExp): { value: string | undefined; removed: number } {
  if (value === undefined) return { value: undefined, removed: 0 };
  const kept = [...value].filter((ch) => allowed.test(ch)).join("");
  return { value: kept || undefined, removed: [...value].length - [...kept].length };
}

/**
 * Lee la configuración de `process.env`. Sin `NOTIFY_DRY_RUN=false` explícito, no se envía nada.
 * Recorta espacios y saltos de línea, y quita del token y del id cualquier carácter que no les corresponda.
 */
export function whatsappConfigFromEnv(env: Record<string, string | undefined> = process.env): WhatsAppConfig {
  const v = (k: string) => env[k]?.trim() || undefined;
  const token = cleanCredential(v("WHATSAPP_ACCESS_TOKEN"), /[A-Za-z0-9._-]/);
  const phoneId = cleanCredential(v("WHATSAPP_PHONE_NUMBER_ID"), /\d/);
  if (token.removed || phoneId.removed) {
    // Solo cuántos: nunca el valor.
    console.warn(`[whatsapp] se quitaron caracteres inválidos de las variables: token ${token.removed}, id ${phoneId.removed}`);
  }
  const e = EnvSchema.parse({
    NOTIFY_DRY_RUN: v("NOTIFY_DRY_RUN")?.toLowerCase(),
    WHATSAPP_ACCESS_TOKEN: token.value,
    WHATSAPP_PHONE_NUMBER_ID: phoneId.value,
    WHATSAPP_GRAPH_VERSION: v("WHATSAPP_GRAPH_VERSION"),
  });
  return {
    accessToken: e.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: e.WHATSAPP_PHONE_NUMBER_ID,
    graphVersion: e.WHATSAPP_GRAPH_VERSION,
    dryRun: e.NOTIFY_DRY_RUN === "true",
  };
}

/**
 * Huella de la configuración para diagnosticar desde fuera (GET /api/health) sin exponer el token: su largo y los
 * primeros 8 hex de su SHA-256. Si coincide con la del `.env.local` que funciona, el token de Vercel es el mismo.
 */
export function whatsappFingerprint(env: Record<string, string | undefined> = process.env) {
  try {
    const c = whatsappConfigFromEnv(env);
    return {
      dryRun: c.dryRun,
      tokenLength: c.accessToken.length,
      tokenSha256: c.accessToken ? createHash("sha256").update(c.accessToken).digest("hex").slice(0, 8) : null,
      phoneNumberIdEnd: c.phoneNumberId.slice(-4) || null,
      graphVersion: c.graphVersion,
    };
  } catch {
    return { error: "variables de WhatsApp inválidas" };
  }
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

type SendOptions = { config?: WhatsAppConfig; fetchImpl?: typeof fetch };

export async function sendWhatsAppText(message: WhatsAppTextMessage, options: SendOptions = {}): Promise<WhatsAppSendResult> {
  if (!message.body.trim()) return { status: "FAILED", error: { reason: "CONFIG", message: "El mensaje está vacío" } };
  return post(
    message.to,
    {
      type: "text",
      text: { body: message.body, preview_url: true },
      ...(message.callbackData ? { biz_opaque_callback_data: message.callbackData } : {}),
    },
    options,
  );
}

/**
 * Plantilla de autenticación (código de un solo uso). A diferencia del texto libre, una plantilla aprobada llega a
 * cualquier número sin ventana de 24 h. Cuerpo y botón "copiar código" reciben el mismo código.
 */
export async function sendWhatsAppAuthTemplate(
  message: { to: string; template: string; language: string; code: string },
  options: SendOptions = {},
): Promise<WhatsAppSendResult> {
  const param = [{ type: "text", text: message.code }];
  return post(
    message.to,
    {
      type: "template",
      template: {
        name: message.template,
        language: { code: message.language },
        components: [
          { type: "body", parameters: param },
          { type: "button", sub_type: "url", index: "0", parameters: param },
        ],
      },
    },
    options,
  );
}

/** Envío común a la Graph API: valida destinatario y configuración, aplica el timeout y traduce los errores. */
async function post(rawTo: string, content: Record<string, unknown>, options: SendOptions): Promise<WhatsAppSendResult> {
  const fail = (error: WhatsAppError): WhatsAppSendResult => ({ status: "FAILED", error });

  const to = normalizeWhatsAppNumber(rawTo);
  if (!to) return fail({ reason: "INVALID_RECIPIENT", message: "El destinatario no es un número internacional válido" });

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
    ...content,
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
    // Solo el tipo y el código de la causa: el mensaje de un TypeError de headers incluye el token.
    const cause = err instanceof Error && err.cause && typeof err.cause === "object" && "code" in err.cause ? ` ${String(err.cause.code)}` : "";
    return fail(
      timedOut
        ? { reason: "TIMEOUT", message: `Meta no respondió en ${TIMEOUT_MS / 1000} s` }
        : { reason: "NETWORK", message: `No se pudo conectar con Meta (${err instanceof Error ? err.name : "error"}${cause})` },
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
