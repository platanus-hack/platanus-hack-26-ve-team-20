// POST /api/officers/location { lat, lng, accuracyM?, onDuty } (oficial) → { recordedAt, onDuty }.
// El cliente la envía cada 30 s; dispatchAlert solo usa ubicaciones de menos de 10 min.
import { OfficerLocationRequestSchema } from "../../lib/contracts/index.ts";
import { db } from "../../lib/db.ts";
import { recordLocation } from "../../lib/alerts/officers.ts";
import { handler, sendOk } from "../_lib/respond.ts";
import { domainErrors, requireOfficer } from "./_session.ts";

export default handler(["POST"], async (req, res) => {
  const officerId = requireOfficer(req);
  const body = OfficerLocationRequestSchema.parse(req.body);
  sendOk(res, await domainErrors(() => recordLocation(db, officerId, body)));
});
