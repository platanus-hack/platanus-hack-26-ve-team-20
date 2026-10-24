// GET /api/admin/officers — oficiales (teléfono enmascarado) para la pantalla de administración.
import { db } from "../../lib/db.ts";
import { officerInvites } from "../../lib/domain/index.ts";
import { requireAdmin } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["GET"], async (req, res) => {
  await requireAdmin(db, req);
  sendOk(res, { items: await officerInvites.listOfficers() });
});
