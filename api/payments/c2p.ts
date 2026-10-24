// POST /api/payments/c2p — Pago Móvil C2P SIMULADO (docs/04 §5). Público: lo identifica el token
// de la multa. Responde 200 con el pago aprobado o rechazado (C2PPaymentDTO); 409 ALREADY_PAID si
// la multa ya estaba pagada. La clave C2P nunca se guarda ni se loguea.
import type { VercelRequest } from "@vercel/node";
import { C2PRequestSchema } from "../../lib/contracts/index.ts";
import { db } from "../../lib/db.ts";
// Hasta el paso 8 del plan de P3: confirmación por WhatsApp en DRY_RUN (lib/notify/mock.ts).
import { notifyPaymentConfirmed } from "../../lib/notify/mock.ts";
import { chargeC2P } from "../../lib/payments/c2p.ts";
import { payFine } from "../../lib/payments/pay-fine.ts";
import { createPrismaPaymentStore } from "../../lib/payments/prisma-store.ts";
import { createRateLimiter } from "../../lib/payments/rate-limit.ts";
import { handler, sendError, sendOk } from "../_lib/respond.ts";

const limiter = createRateLimiter({ limit: 10, windowMs: 10 * 60_000 });
const store = createPrismaPaymentStore(db);

function clientIp(req: VercelRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || req.socket.remoteAddress || "unknown";
}

export default handler(["POST"], async (req, res) => {
  const ip = clientIp(req);
  if (!limiter.hit(ip)) return sendError(res, "RATE_LIMITED", "Demasiados intentos de pago. Espere unos minutos.");

  const body = C2PRequestSchema.parse(req.body);
  const result = await payFine(body, { type: "CITIZEN", ip }, { store, charge: chargeC2P, notifyPaymentConfirmed });
  if (result.kind === "error") return sendError(res, result.code, result.message);
  sendOk(res, result.data);
});
