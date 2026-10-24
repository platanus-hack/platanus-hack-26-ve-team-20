// GET /api/officer/fines/:id — detalle con vehículo, evidencia y auditoría (docs/12 §2).
import { db } from "../../lib/db.ts";
import { officerFines } from "../../lib/domain/index.ts";
import { requireActiveOfficer } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["GET"], async (req, res) => {
  await requireActiveOfficer(db, req);
  const raw = req.query["id"];
  sendOk(res, await officerFines.detail(Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "")));
});
