// POST /api/violations/[id]/review  (admin) — docs/04 §2, HU-07.
//   { "action": "APPROVE", "plate"?: "AB123CD", "note"?: "..." }  → crea la multa y avisa al conductor
//   { "action": "VOID", "reason": "..." }                          → anula la violación
// 409 `INVALID_TRANSITION` si el estado actual no lo permite (p. ej. ya fue aprobada por otro operador).
import { ReviewRequestSchema } from "../../lib/contracts/index.ts";
import { db } from "../../lib/db.ts";
import { reviewViolation } from "../../lib/domain/index.ts";
import { getClientIp, requireAdmin } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["POST"], async (req, res) => {
  const admin = await requireAdmin(db, req);
  const raw = req.query["id"];
  const id = Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
  const input = ReviewRequestSchema.parse(req.body);
  sendOk(res, await reviewViolation(id, input, { type: "OPERATOR", id: admin.id, ip: getClientIp(req) }));
});
