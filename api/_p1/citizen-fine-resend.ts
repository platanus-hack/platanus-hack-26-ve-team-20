// POST /api/citizen/fines/:id/resend — el titular se reenvía por WhatsApp la notificación de una multa propia por
// pagar. Máximo 3 por hora por multa. 404 NO_ENCONTRADA si es ajena; 409 NO_REENVIABLE / SIN_TELEFONO.
import { db } from "../../lib/db.ts";
import { resendMyFine } from "../../lib/domain/index.ts";
import { getClientIp, requireCitizen } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["POST"], async (req, res) => {
  const { account, person } = await requireCitizen(db, req, res);
  const raw = req.query["id"];
  sendOk(res, await resendMyFine({ personId: person.id, accountId: account.id, fineId: Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? ""), ip: getClientIp(req) }));
});
