// POST /api/citizen/login  { cedula, password } — login del ciudadano. Un único error (401 CREDENCIALES) para todos los fallos.
import { CitizenLoginSchema } from "../../lib/contracts/index.ts";
import { citizen } from "../../lib/domain/index.ts";
import { toProfile } from "../../lib/domain/citizen-data.ts";
import { assertSameOrigin, getClientIp, issueCitizenSession } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["POST"], async (req, res) => {
  assertSameOrigin(req);
  const { cedula, password } = CitizenLoginSchema.parse(req.body);
  const { account, person } = await citizen.login({ cedula, password, ip: getClientIp(req) });
  issueCitizenSession(res, account);
  sendOk(res, { user: toProfile(person) });
});
