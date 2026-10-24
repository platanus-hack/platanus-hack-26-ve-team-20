// POST /api/alerts/[id]/ack (oficial) → { status: "ACKNOWLEDGED", ackAt } (docs/04 §6).
// Solo el oficial al que se le asignó la alerta; repetir el acuse no cambia nada.
import { z } from "zod";
import { db } from "../../../lib/db.ts";
import { acknowledgeAlert } from "../../../lib/alerts/officers.ts";
import { handler, sendOk } from "../../_lib/respond.ts";
import { domainErrors, requireOfficer } from "../../officers/_session.ts";

const QuerySchema = z.object({ id: z.string().min(1) });

export default handler(["POST"], async (req, res) => {
  const officerId = requireOfficer(req);
  const { id } = QuerySchema.parse(req.query);
  sendOk(res, await domainErrors(() => acknowledgeAlert(db, officerId, id)));
});
