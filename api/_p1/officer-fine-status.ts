// POST /api/officer/fines/:id/status { action, reason } — anular o resolver una apelación (docs/12 §3).
import { OfficerFineStatusSchema } from "../../lib/contracts/index.ts";
import { db } from "../../lib/db.ts";
import { officerFines } from "../../lib/domain/index.ts";
import { getClientIp, requireActiveOfficer } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["POST"], async (req, res) => {
  const { officerId } = await requireActiveOfficer(db, req);
  const { action, reason } = OfficerFineStatusSchema.parse(req.body);
  const raw = req.query["id"];
  sendOk(res, await officerFines.changeStatus({ id: Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? ""), action, reason, officerId, ip: getClientIp(req) }));
});
