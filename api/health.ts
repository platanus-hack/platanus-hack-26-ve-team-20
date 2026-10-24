// GET /api/health → estado, hora y la huella de WhatsApp (sin secretos) para comparar la configuración de Vercel
// con la local: `whatsapp.tokenSha256` son los primeros 8 hex del SHA-256 del token, nunca el token.
import { whatsappFingerprint } from "../lib/notify/whatsapp.ts";
import { handler, sendOk } from "./_lib/respond.ts";

export default handler(["GET"], (_req, res) => {
  sendOk(res, { status: "ok", time: new Date().toISOString(), whatsapp: whatsappFingerprint() });
});
