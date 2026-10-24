// POST /api/auth/logout — borra la cookie de sesión de admin. Idempotente: no exige sesión.
import { assertSameOrigin, clearAdminSession } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["POST"], (req, res) => {
  assertSameOrigin(req);
  clearAdminSession(res);
  sendOk(res, {});
});
