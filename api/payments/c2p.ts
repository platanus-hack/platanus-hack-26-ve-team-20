// POST /api/payments/c2p — Pago Móvil C2P SIMULADO (docs/04 §5). Público: lo identifica el token
// de la multa. Responde 200 con el pago aprobado o rechazado (C2PPaymentDTO); 409 ALREADY_PAID si
// la multa ya estaba pagada. La clave C2P nunca se guarda ni se loguea.
import { C2PRequestSchema } from "../../lib/contracts/index.ts";
import { db } from "../../lib/db.ts";
import { consumeLimit } from "../../lib/domain/rate-limit.ts";
import { notifyPaymentConfirmed } from "../../lib/notify/index.ts";
import { chargeC2P } from "../../lib/payments/c2p.ts";
import { payFine } from "../../lib/payments/pay-fine.ts";
import { createPrismaPaymentStore } from "../../lib/payments/prisma-store.ts";
import { assertSameOrigin, getClientIp } from "../_lib/auth.ts";
import { handler, sendError, sendOk } from "../_lib/respond.ts";

const store = createPrismaPaymentStore(db);

export default handler(["POST"], async (req, res) => {
  assertSameOrigin(req);
  const ip = getClientIp(req) ?? "unknown";
  // 10 intentos cada 10 min por IP, contados en AuditLog (lib/domain/rate-limit.ts de P1)
  await consumeLimit(
    db,
    { action: "PAYMENT_ATTEMPT", ip, max: 10, windowMs: 10 * 60_000, lockKey: `payment:${ip}` },
    { actor: { type: "CITIZEN", ip }, action: "PAYMENT_ATTEMPT", entity: "Payment" },
  );

  const body = C2PRequestSchema.parse(req.body);
  const result = await payFine(body, { type: "CITIZEN", ip }, { store, charge: chargeC2P, notifyPaymentConfirmed });
  if (result.kind === "error") return sendError(res, result.code, result.message);
  sendOk(res, result.data);
});
