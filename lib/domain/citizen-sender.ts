// Envío del código de verificación por WhatsApp (P1) usando el cliente de P3 (`sendWhatsAppText`): solo texto
// desde el número de prueba, dentro de la ventana de 24 h. Nunca lanza y nunca registra el código.
import { sendWhatsAppText } from "../notify/whatsapp.ts";
import type { CodeSendResult } from "./citizen.ts";

type SendOptions = Parameters<typeof sendWhatsAppText>[1];

export function createCodeSender(options?: SendOptions) {
  return async (phone: string, code: string): Promise<CodeSendResult> => {
    const result = await sendWhatsAppText(
      { to: phone, body: `SmartTraffic: su código de verificación es ${code}. Vence en 10 minutos. Si usted no lo solicitó, ignore este mensaje.` },
      options,
    );
    if (result.status === "SENT") return { delivered: true };
    if (result.status === "DRY_RUN") return { delivered: false, reason: "DRY_RUN" };
    return { delivered: false, reason: result.error.reason };
  };
}
