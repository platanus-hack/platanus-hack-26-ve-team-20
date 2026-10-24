// GET  /api/admin/officer-invitations  → lista de invitaciones (más recientes primero).
// POST /api/admin/officer-invitations  { email, name } → crea la invitación y envía el correo (docs/04 §0d).
// `emailSent: false` (sin Resend o falló) devuelve además `inviteUrl` para que el admin copie el enlace.
import { OfficerInvitationCreateSchema } from "../../lib/contracts/index.ts";
import { db } from "../../lib/db.ts";
import { officerInvites } from "../../lib/domain/index.ts";
import { getClientIp, requireAdmin } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["GET", "POST"], async (req, res) => {
  const admin = await requireAdmin(db, req);
  if (req.method === "GET") return sendOk(res, { items: await officerInvites.list() });
  const { email, name } = OfficerInvitationCreateSchema.parse(req.body);
  sendOk(res, await officerInvites.create({ email, name, adminId: admin.id, ip: getClientIp(req) }), 201);
});
