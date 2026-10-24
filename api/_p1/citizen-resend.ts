// POST /api/citizen/register/resend  { cedula } — nuevo código para un registro pendiente (30 s entre envíos).
import { CitizenResendSchema } from "../../lib/contracts/index.ts";
import { citizen } from "../../lib/domain/index.ts";
import { assertSameOrigin, getClientIp } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["POST"], async (req, res) => {
  assertSameOrigin(req);
  const { cedula } = CitizenResendSchema.parse(req.body);
  sendOk(res, await citizen.resendCode({ cedula, ip: getClientIp(req) }));
});
