// POST /api/admin/officers/:id/active { active } — desactiva o reactiva a un oficial (queda auditado).
import { OfficerActiveSchema } from "../../lib/contracts/index.ts";
import { db } from "../../lib/db.ts";
import { officerInvites } from "../../lib/domain/index.ts";
import { getClientIp, requireAdmin } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["POST"], async (req, res) => {
  const admin = await requireAdmin(db, req);
  const { active } = OfficerActiveSchema.parse(req.body);
  const raw = req.query["id"];
  sendOk(res, await officerInvites.setActive({ id: Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? ""), active, adminId: admin.id, ip: getClientIp(req) }));
});
