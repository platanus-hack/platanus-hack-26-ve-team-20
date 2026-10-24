// POST /api/officer/invitation/accept { token, name?, phone, password } — público. Crea la cuenta del oficial
// (placa OF-NNNN) y abre su sesión (cookie `vc_officer`, la misma que usa P3 en /api/officers/*).
import { OfficerInvitationAcceptSchema, type OfficerSessionDTO } from "../../lib/contracts/index.ts";
import { officerInvites } from "../../lib/domain/index.ts";
import { toOfficerSession } from "../../lib/domain/officer-invitations.ts";
import { assertSameOrigin, getClientIp, issueOfficerSession } from "../_lib/auth.ts";
import { handler, sendOk } from "../_lib/respond.ts";

export default handler(["POST"], async (req, res) => {
  assertSameOrigin(req);
  const { token, name, phone, password } = OfficerInvitationAcceptSchema.parse(req.body);
  const officer = await officerInvites.accept({ token, name, phone, password, ip: getClientIp(req) });
  issueOfficerSession(res, officer.id);
  const data: { officer: OfficerSessionDTO } = { officer: toOfficerSession(officer) };
  sendOk(res, data, 201);
});
