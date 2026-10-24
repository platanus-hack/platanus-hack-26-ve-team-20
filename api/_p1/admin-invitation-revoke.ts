// POST /api/admin/officer-invitations/:id/revoke — anula una invitación pendiente (idempotente; una usada da 409).
import { db } from "../../lib/db.ts";
import { officerInvites } from "../../lib/domain/index.ts";
import { getClientIp, requireAdmin } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["POST"], async (req, res) => {
  const admin = await requireAdmin(db, req);
  const raw = req.query["id"];
  sendOk(res, await officerInvites.revoke({ id: Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? ""), adminId: admin.id, ip: getClientIp(req) }));
});
