// POST /api/citizen/logout — borra la cookie de sesión del ciudadano. Idempotente: no exige sesión.
import { assertSameOrigin, clearCitizenSession } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["POST"], async (req, res) => {
  assertSameOrigin(req);
  clearCitizenSession(res);
  sendOk(res, {});
});
