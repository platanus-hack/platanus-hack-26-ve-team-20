// POST /api/officers/session { passcode, badge } → cookie de oficial (docs/04 §6). DELETE cierra la sesión.
// La cookie la firma api/_lib/auth.ts (P1, SESSION_SECRET). Mismo 401 para placa o código incorrectos,
// para no revelar qué placas existen; los intentos fallidos se registran y se limitan por IP.
import { OfficerSessionRequestSchema } from "../../lib/contracts/index.ts";
import { clearCookie } from "../../lib/auth/session.ts";
import { db } from "../../lib/db.ts";
import { audit } from "../../lib/domain/audit.ts";
import { assertUnderLimit } from "../../lib/domain/rate-limit.ts";
import { findOfficerByBadge } from "../../lib/alerts/officers.ts";
import { assertSameOrigin, getClientIp, issueOfficerSession, safeEqual } from "../_lib/auth.ts";
import { ApiError, handler, sendOk } from "../_lib/respond.ts";

const FAILED = "OFFICER_LOGIN_FAILED";

export default handler(["POST", "DELETE"], async (req, res) => {
  assertSameOrigin(req);
  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", clearCookie("officer"));
    return sendOk(res, { loggedOut: true });
  }

  const { passcode, badge } = OfficerSessionRequestSchema.parse(req.body);
  const ip = getClientIp(req);
  await assertUnderLimit(db, { action: FAILED, ip, max: 10, windowMs: 10 * 60_000 });

  const expected = process.env.OFFICER_PASSCODE ?? "";
  const officer = expected && safeEqual(passcode, expected) ? await findOfficerByBadge(db, badge.trim().toUpperCase()) : null;
  if (!officer) {
    await audit(db, { actor: { type: "OFFICER", ip }, action: FAILED, entity: "Officer" });
    throw new ApiError("UNAUTHORIZED", "Placa de oficial o código incorrectos");
  }

  await audit(db, { actor: { type: "OFFICER", id: officer.id, ip }, action: "OFFICER_LOGIN", entity: "Officer", entityId: officer.id });
  issueOfficerSession(res, officer.id);
  sendOk(res, officer);
});
