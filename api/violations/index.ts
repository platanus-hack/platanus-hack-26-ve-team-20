// GET /api/violations?status=NEEDS_REVIEW&since=ISO&limit=50  (admin) — docs/04 §2.
// Lista las violaciones más recientemente modificadas primero. Alimenta la cola de revisión
// (`/admin/revision`) y el feed en vivo de `/camaras` (sondeo con `since` = `nextSince`).
import { ViolationsQuerySchema } from "../../lib/contracts/index.ts";
import { db } from "../../lib/db.ts";
import { listViolations } from "../../lib/domain/queries.ts";
import { requireAdmin } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["GET"], async (req, res) => {
  requireAdmin(req);
  const query = ViolationsQuerySchema.parse(req.query);
  sendOk(res, await listViolations(db, query));
});
