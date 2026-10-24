// Correo transaccional por SMTP (p. ej. Gmail con contraseña de aplicación: no requiere dominio propio).
// Nunca lanza y nunca registra el cuerpo del mensaje (lleva enlaces con tokens). Con NOTIFY_DRY_RUN distinto
// de "false" no envía nada.
import nodemailer from "nodemailer";

const TIMEOUT_MS = 10_000;

export interface EmailMessage { to: string; subject: string; text: string; html?: string }
export type EmailResult =
  | { status: "SENT"; providerId: string }
  | { status: "DRY_RUN" }
  | { status: "FAILED"; reason: "CONFIG" | "SMTP"; message: string };

export interface SmtpConfig { host: string; port: number; user: string; pass: string }
export interface EmailConfig { from: string; dryRun: boolean; smtp?: SmtpConfig }

/** Envía un mensaje por SMTP; se inyecta en los tests. Lanza si el servidor lo rechaza. */
export type SmtpTransport = (smtp: SmtpConfig, mail: { from: string; to: string; subject: string; text: string; html?: string }) => Promise<{ messageId: string }>;

/**
 * Lee `SMTP_*`, `EMAIL_FROM` y `NOTIFY_DRY_RUN`. Sin `NOTIFY_DRY_RUN=false` explícito no se envía.
 * `EMAIL_FROM` es opcional (por defecto, el usuario SMTP). Sin host, usuario y contraseña no hay SMTP.
 */
export function emailConfigFromEnv(env: Record<string, string | undefined> = process.env): EmailConfig {
  const host = env["SMTP_HOST"]?.trim() ?? "";
  const user = env["SMTP_USER"]?.trim() ?? "";
  const pass = env["SMTP_PASS"] ?? "";
  const port = Number(env["SMTP_PORT"] || 465);
  const smtp = host && user && pass && Number.isInteger(port) && port > 0 ? { host, port, user, pass } : undefined;
  return { from: env["EMAIL_FROM"]?.trim() || (smtp ? user : ""), dryRun: env["NOTIFY_DRY_RUN"] !== "false", ...(smtp && { smtp }) };
}

const smtpTransport: SmtpTransport = async (smtp, mail) => {
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465, // 465 = TLS implícito; 587 = STARTTLS
    auth: { user: smtp.user, pass: smtp.pass },
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });
  try {
    return await transporter.sendMail(mail);
  } finally {
    transporter.close();
  }
};

export async function sendEmail(message: EmailMessage, options: { config?: EmailConfig; smtpImpl?: SmtpTransport } = {}): Promise<EmailResult> {
  const config = options.config ?? emailConfigFromEnv();
  if (config.dryRun) return { status: "DRY_RUN" };
  if (!config.smtp || !config.from) return { status: "FAILED", reason: "CONFIG", message: "Falta configurar SMTP_HOST, SMTP_USER y SMTP_PASS" };
  try {
    const sent = await (options.smtpImpl ?? smtpTransport)(config.smtp, {
      from: config.from, to: message.to, subject: message.subject, text: message.text, ...(message.html && { html: message.html }),
    });
    return { status: "SENT", providerId: sent.messageId };
  } catch {
    // El mensaje de error de SMTP puede traer el usuario o el servidor: no se propaga.
    return { status: "FAILED", reason: "SMTP", message: "El servidor SMTP no aceptó el mensaje" };
  }
}
