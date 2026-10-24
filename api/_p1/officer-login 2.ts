// POST /api/officer/login { email, password } — oficiales con cuenta (los del seed siguen con /api/officers/session).
// Un único error `CREDENCIALES` (401) para correo desconocido, contraseña errónea y cuenta desactivada.
import { OfficerLoginSchema, type OfficerSessionDTO } from "../../lib/contracts/index.ts";
import { officerInvites } from "../../lib/domain/index.ts";
import { toOfficerSession } from "../../lib/domain/officer-invitations.ts";
import { assertSameOrigin, getClientIp, issueOfficerSession } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["POST"], async (req, res) => {
  assertSameOrigin(req);
  const { email, password } = OfficerLoginSchema.parse(req.body);
  const officer = await officerInvites.login({ email, password, ip: getClientIp(req) });
  issueOfficerSession(res, officer.id);
  const data: { officer: OfficerSessionDTO } = { officer: toOfficerSession(officer) };
  sendOk(res, data);
});
