// GET /api/auth/me — la sesión de admin actual (la SPA lo usa para decidir si muestra el login).
import { db } from "../../lib/db.ts";
import { requireAdmin } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["GET"], async (req, res) => {
  sendOk(res, { user: await requireAdmin(db, req) });
});
