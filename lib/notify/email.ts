// Correo transaccional con Resend (API REST, sin dependencias). Nunca lanza y nunca registra el cuerpo del
// mensaje (lleva enlaces con tokens). Con NOTIFY_DRY_RUN distinto de "false" no envía nada.
import { z } from "zod";

const TIMEOUT_MS = 10_000;

export interface EmailMessage { to: string; subject: string; text: string; html?: string }
export type EmailResult =
  | { status: "SENT"; providerId: string }
  | { status: "DRY_RUN" }
  | { status: "FAILED"; reason: "CONFIG" | "HTTP" | "TIMEOUT" | "NETWORK" | "INVALID_RESPONSE"; message: string };

export interface EmailConfig { apiKey: string; from: string; dryRun: boolean }

/** Lee `RESEND_API_KEY`, `EMAIL_FROM` y `NOTIFY_DRY_RUN`. Sin `NOTIFY_DRY_RUN=false` explícito no se envía. */
export function emailConfigFromEnv(env: Record<string, string | undefined> = process.env): EmailConfig {
  return { apiKey: env["RESEND_API_KEY"] ?? "", from: env["EMAIL_FROM"] ?? "", dryRun: env["NOTIFY_DRY_RUN"] !== "false" };
}

const SuccessSchema = z.object({ id: z.string().min(1) });

export async function sendEmail(
  message: EmailMessage,
  options: { config?: EmailConfig; fetchImpl?: typeof fetch } = {},
): Promise<EmailResult> {
  const config = options.config ?? emailConfigFromEnv();
  if (config.dryRun) return { status: "DRY_RUN" };
  if (!config.apiKey || !config.from) return { status: "FAILED", reason: "CONFIG", message: "Faltan RESEND_API_KEY o EMAIL_FROM" };

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: config.from, to: [message.to], subject: message.subject, text: message.text, ...(message.html && { html: message.html }) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
    return timedOut
      ? { status: "FAILED", reason: "TIMEOUT", message: `Resend no respondió en ${TIMEOUT_MS / 1000} s` }
      : { status: "FAILED", reason: "NETWORK", message: "No se pudo conectar con Resend" };
  }
  if (!response.ok) return { status: "FAILED", reason: "HTTP", message: `HTTP ${response.status}` };
  let json: unknown;
  try { json = await response.json(); } catch { return { status: "FAILED", reason: "INVALID_RESPONSE", message: "Respuesta no JSON de Resend" }; }
  const parsed = SuccessSchema.safeParse(json);
  return parsed.success ? { status: "SENT", providerId: parsed.data.id } : { status: "FAILED", reason: "INVALID_RESPONSE", message: "Resend no devolvió el id" };
}
