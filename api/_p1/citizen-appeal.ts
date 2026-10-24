// POST /api/citizen/fines/:id/appeal — apela una multa propia pendiente o vencida (pasa a APPEALED).
import { db } from "../../lib/db.ts";
import { appealCitizenFine } from "../../lib/domain/citizen-data.ts";
import { getClientIp, requireCitizen } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["POST"], async (req, res) => {
  const { account, person } = await requireCitizen(db, req, res);
  const raw = req.query["id"];
  const fineId = Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
  sendOk(res, await appealCitizenFine(db, { personId: person.id, accountId: account.id, fineId, ip: getClientIp(req) }));
});
