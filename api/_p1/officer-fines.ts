// GET /api/officer/fines?cedula=&plate=&cursor=&limit= — historial de multas del oficial (docs/12 §1).
import { OfficerFinesQuerySchema } from "../../lib/contracts/index.ts";
import { db } from "../../lib/db.ts";
import { officerFines } from "../../lib/domain/index.ts";
import { requireActiveOfficer } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["GET"], async (req, res) => {
  await requireActiveOfficer(db, req);
  sendOk(res, await officerFines.list(OfficerFinesQuerySchema.parse(req.query)));
});
