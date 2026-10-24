// POST /api/choques/incidentes { x, y, radiusM, reporterId? } → { incident, ownAlert }.
// Desde un teléfono (reporterId) o desde la consola de /choques/vivo.
import { CrashReportRequestSchema } from "../../lib/contracts/index.ts";
import { report } from "../../lib/crash/network.ts";
import { db } from "../../lib/db.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["POST"], async (req, res) => {
  sendOk(res, await report(db, CrashReportRequestSchema.parse(req.body)), 201);
});
