// Correo de invitación a un oficial (P1). Trato formal ("usted"). Nunca lanza y nunca registra el enlace.
import { sendEmail, type EmailConfig } from "../notify/email.ts";
import type { InviteEmail, InviteSendResult } from "./officer-invitations.ts";

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

export function inviteEmailContent(m: InviteEmail): { subject: string; text: string; html: string } {
  const days = Math.max(1, Math.round((m.expiresAt.getTime() - Date.now()) / 86_400_000));
  const text =
    `Hola, ${m.name}.\n\nUsted fue invitado(a) a SmartTraffic como oficial de tránsito. ` +
    `Para activar su cuenta, abra este enlace y elija su teléfono y contraseña:\n\n${m.url}\n\n` +
    `El enlace es personal, funciona una sola vez y vence en ${days} día${days === 1 ? "" : "s"}. ` +
    `Si usted no esperaba esta invitación, ignore este mensaje.\n\nSmartTraffic (demostración)`;
  const html =
    `<p>Hola, ${escapeHtml(m.name)}.</p><p>Usted fue invitado(a) a SmartTraffic como oficial de tránsito. ` +
    `Para activar su cuenta, elija su teléfono y contraseña:</p>` +
    `<p><a href="${escapeHtml(m.url)}">Activar mi cuenta de oficial</a></p>` +
    `<p>El enlace es personal, funciona una sola vez y vence en ${days} día${days === 1 ? "" : "s"}. ` +
    `Si usted no esperaba esta invitación, ignore este mensaje.</p><p>SmartTraffic (demostración)</p>`;
  return { subject: "Invitación a SmartTraffic como oficial de tránsito", text, html };
}

export function createInviteSender(options?: { config?: EmailConfig; fetchImpl?: typeof fetch }) {
  return async (m: InviteEmail): Promise<InviteSendResult> => {
    const content = inviteEmailContent(m);
    const r = await sendEmail({ to: m.to, ...content }, options);
    if (r.status === "SENT") return { delivered: true };
    return { delivered: false, reason: r.status === "DRY_RUN" ? "DRY_RUN" : r.reason };
  };
}
