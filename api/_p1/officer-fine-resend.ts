// POST /api/officer/fines/:id/resend — reenvía al titular el WhatsApp de la multa (docs/12 §6).
// Solo multas pendientes o vencidas; máximo 3 por hora por multa. 409 NO_REENVIABLE / SIN_TITULAR / SIN_TELEFONO.
import { db } from "../../lib/db.ts";
import { officerFines } from "../../lib/domain/index.ts";
import { getClientIp, requireActiveOfficer } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["POST"], async (req, res) => {
  const { officerId } = await requireActiveOfficer(db, req);
  const raw = req.query["id"];
  sendOk(res, await officerFines.resendNotification({ id: Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? ""), officerId, ip: getClientIp(req) }));
});
