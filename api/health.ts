import type { VercelRequest, VercelResponse } from "@vercel/node";

// Formato de la API: { ok: true, data } | { ok: false, error: { code, message } } (docs/04).
export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(400).json({ ok: false, error: { code: "VALIDATION_ERROR", message: `Método no permitido: ${req.method}` } });
    return;
  }
  res.status(200).json({ ok: true, data: { status: "ok", time: new Date().toISOString() } });
}
