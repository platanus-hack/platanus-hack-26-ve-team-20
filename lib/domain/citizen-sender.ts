// Envío del código de verificación por WhatsApp (P1) con el cliente de P3. Con `WHATSAPP_TEMPLATE_CODE` usa la
// plantilla de autenticación aprobada (llega a cualquier número); sin ella cae a texto libre, que solo llega
// dentro de la ventana de 24 h. Nunca lanza y nunca registra el código.
import { describeWhatsAppError, sendWhatsAppAuthTemplate, sendWhatsAppText } from "../notify/whatsapp.ts";
import type { CodeSendResult } from "./citizen.ts";

type SendOptions = Parameters<typeof sendWhatsAppText>[1];

export function createCodeSender(options?: SendOptions) {
  return async (phone: string, code: string): Promise<CodeSendResult> => {
    const template = process.env["WHATSAPP_TEMPLATE_CODE"]?.trim();
    const result = template
      ? await sendWhatsAppAuthTemplate({ to: phone, template, language: process.env["WHATSAPP_TEMPLATE_LANG"]?.trim() || "es", code }, options)
      : await sendWhatsAppText(
          { to: phone, body: `SmartTraffic: su código de verificación es ${code}. Vence en 10 minutos. Si usted no lo solicitó, ignore este mensaje.` },
          options,
        );
    if (result.status === "SENT") return { delivered: true };
    // El motivo va al log de Vercel (sin teléfono ni código) para saber por qué no llegó.
    if (result.status === "DRY_RUN") {
      console.warn("[citizen] código no enviado: NOTIFY_DRY_RUN no es false");
      return { delivered: false, reason: "DRY_RUN" };
    }
    console.warn(`[citizen] código no enviado: ${describeWhatsAppError(result.error)}`);
    return { delivered: false, reason: result.error.reason };
  };
}
