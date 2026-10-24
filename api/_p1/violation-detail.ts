// GET /api/violations/[id]  (admin) — detalle para la pantalla de revisión (docs/05 §3.7):
// el ítem de la lista más la salida del modelo (`aiOutput`) y de la regla (`ruleOutput`).
import { db } from "../../lib/db.ts";
import { getViolationDetail } from "../../lib/domain/queries.ts";
import { requireAdmin } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["GET"], async (req, res) => {
  await requireAdmin(db, req);
  const raw = req.query["id"];
  const id = Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
  sendOk(res, await getViolationDetail(db, id));
});
