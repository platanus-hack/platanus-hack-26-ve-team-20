// Una sola Vercel Function para las rutas de P3 (el plan Hobby admite 12 funciones por deploy).
// vercel.json reescribe las URLs públicas de docs/04 §5–§6 a /api/p3?route=…, así que los clientes
// no cambian. Los handlers viven en api/_p3/ (el prefijo `_` evita que Vercel los cuente como funciones).
// El webhook de WhatsApp queda aparte (api/webhooks/whatsapp.ts): usa la firma Web para leer el body crudo.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendError } from "./_lib/respond.ts";
import alertAck from "./_p3/alert-ack.ts";
import officerAlerts from "./_p3/officer-alerts.ts";
import officerLocation from "./_p3/officer-location.ts";
import officerSession from "./_p3/officer-session.ts";
import paymentsC2p from "./_p3/payments-c2p.ts";

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void> | void;

/** route → handler. Cada handler valida su método y su sesión con handler() de P1. */
export const P3_ROUTES: Record<string, Handler> = {
  "payments-c2p": paymentsC2p, //       POST /api/payments/c2p
  "officer-session": officerSession, // POST|DELETE /api/officers/session
  "officer-location": officerLocation, // POST /api/officers/location
  "officer-alerts": officerAlerts, //   GET /api/officers/:id/alerts
  "alert-ack": alertAck, //             POST /api/alerts/:id/ack
};

export default function p3(req: VercelRequest, res: VercelResponse) {
  const route = req.query["route"];
  const fn = typeof route === "string" ? P3_ROUTES[route] : undefined;
  if (!fn) return sendError(res, "NOT_FOUND", "Ruta no encontrada");
  return fn(req, res);
}
