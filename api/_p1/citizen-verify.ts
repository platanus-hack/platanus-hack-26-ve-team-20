// POST /api/citizen/register/verify  { cedula, code } — paso 2: con el código correcto se crea la cuenta y se abre la sesión.
import { CitizenVerifySchema } from "../../lib/contracts/index.ts";
import { db } from "../../lib/db.ts";
import { citizen } from "../../lib/domain/index.ts";
import { listCitizenVehicles, toProfile } from "../../lib/domain/citizen-data.ts";
import { assertSameOrigin, getClientIp, issueCitizenSession } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["POST"], async (req, res) => {
  assertSameOrigin(req);
  const { cedula, code } = CitizenVerifySchema.parse(req.body);
  const { account, person } = await citizen.verifyRegistration({ cedula, code, ip: getClientIp(req) });
  issueCitizenSession(res, account);
  sendOk(res, { user: toProfile(person), vehicles: await listCitizenVehicles(db, person.id) });
});
