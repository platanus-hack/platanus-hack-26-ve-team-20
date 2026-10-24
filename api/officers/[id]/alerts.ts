// GET /api/officers/[id]/alerts?since=ISO (oficial) → { items: OfficerAlertDTO[] } (docs/04 §6).
// Solo el propio oficial: el [id] tiene que coincidir con el de la sesión. /oficial lo consulta cada 3 s.
import { z } from "zod";
import { db } from "../../../lib/db.ts";
import { listOfficerAlerts } from "../../../lib/alerts/officers.ts";
import { requireOfficer } from "../../_lib/auth.ts";
import { ApiError, handler, sendOk } from "../../_lib/respond.ts";

const QuerySchema = z.object({
  id: z.string().min(1),
  since: z.iso.datetime({ offset: true }).optional(),
});

export default handler(["GET"], async (req, res) => {
  const { officerId } = requireOfficer(req);
  const query = QuerySchema.parse(req.query);
  if (query.id !== officerId) throw new ApiError("UNAUTHORIZED", "Solo puede ver sus propias alertas");
  sendOk(res, { items: await listOfficerAlerts(db, officerId, query.since) });
});
