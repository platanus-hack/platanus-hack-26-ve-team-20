// POST /api/officers/session { passcode, badge } → cookie de oficial (docs/04 §6). DELETE cierra la sesión.
// Mismo 401 para placa o passcode incorrectos, para no revelar qué placas existen.
import { OfficerSessionRequestSchema } from "../../lib/contracts/index.ts";
import { audit } from "../../lib/domain/audit.ts";
import { db } from "../../lib/db.ts";
import { findOfficerByBadge } from "../../lib/alerts/officers.ts";
import { clearSessionCookie, createSessionToken, passcodeMatches, sessionCookie } from "../../lib/alerts/officer-session.ts";
import { createRateLimiter } from "../../lib/payments/rate-limit.ts";
import { handler, sendError, sendOk } from "../_lib/respond.ts";
import { clientIp, isHttps, officerPasscode } from "./_session.ts";

const limiter = createRateLimiter({ limit: 10, windowMs: 10 * 60_000 });

export default handler(["POST", "DELETE"], async (req, res) => {
  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", clearSessionCookie({ secure: isHttps(req) }));
    return sendOk(res, { loggedOut: true });
  }

  const ip = clientIp(req);
  if (!limiter.hit(ip)) return sendError(res, "RATE_LIMITED", "Demasiados intentos. Espere unos minutos.");

  const body = OfficerSessionRequestSchema.parse(req.body);
  const officer = passcodeMatches(body.passcode, officerPasscode()) ? await findOfficerByBadge(db, body.badge.trim().toUpperCase()) : null;
  if (!officer) return sendError(res, "UNAUTHORIZED", "Placa de oficial o código incorrectos");

  await audit(db, { actor: { type: "OFFICER", id: officer.id, ip }, action: "OFFICER_LOGIN", entity: "Officer", entityId: officer.id });
  res.setHeader("Set-Cookie", sessionCookie(createSessionToken(officer.id, officerPasscode()), { secure: isHttps(req) }));
  sendOk(res, officer);
});
