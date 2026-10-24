// POST /api/officer/invitation/check { token } — público. Devuelve `{ email, name, expiresAt }` si el enlace sirve;
// 404 `INVITACION_INVALIDA` igual para token inexistente, vencido, usado o revocado.
import { OfficerInvitationTokenSchema } from "../../lib/contracts/index.ts";
import { officerInvites } from "../../lib/domain/index.ts";
import { assertSameOrigin, getClientIp } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["POST"], async (req, res) => {
  assertSameOrigin(req);
  const { token } = OfficerInvitationTokenSchema.parse(req.body);
  sendOk(res, await officerInvites.preview({ token, ip: getClientIp(req) }));
});
