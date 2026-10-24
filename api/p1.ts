// Una sola Vercel Function para las rutas de P1 (el plan Hobby admite 12 funciones por deploy y P2 y P3
// también necesitan las suyas). vercel.json reescribe las URLs públicas de docs/04 a /api/p1?route=…, así
// que los clientes no cambian. Los handlers viven en api/_p1/ (el prefijo `_` evita que Vercel los
// cuente como funciones). Cada handler valida su método y su sesión con handler() y las guardas de
// api/_lib/auth.ts. Un test comprueba que este mapa y vercel.json estén sincronizados.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendError } from "./_lib/respond.ts";
import adminInvitations from "./_p1/admin-invitations.ts";
import adminInvitationRevoke from "./_p1/admin-invitation-revoke.ts";
import adminOfficers from "./_p1/admin-officers.ts";
import adminOfficerActive from "./_p1/admin-officer-active.ts";
import officerInvitation from "./_p1/officer-invitation.ts";
import officerAccept from "./_p1/officer-accept.ts";
import officerLogin from "./_p1/officer-login.ts";
import authLogin from "./_p1/auth-login.ts";
import authLogout from "./_p1/auth-logout.ts";
import authMe from "./_p1/auth-me.ts";
import citizenAppeal from "./_p1/citizen-appeal.ts";
import citizenFine from "./_p1/citizen-fine.ts";
import citizenFines from "./_p1/citizen-fines.ts";
import citizenLogin from "./_p1/citizen-login.ts";
import citizenLogout from "./_p1/citizen-logout.ts";
import citizenMe from "./_p1/citizen-me.ts";
import citizenPassword from "./_p1/citizen-password.ts";
import citizenRegister from "./_p1/citizen-register.ts";
import citizenResend from "./_p1/citizen-resend.ts";
import citizenVehicles from "./_p1/citizen-vehicles.ts";
import citizenVerify from "./_p1/citizen-verify.ts";
import violationDetail from "./_p1/violation-detail.ts";
import violationReview from "./_p1/violation-review.ts";
import violationsList from "./_p1/violations-list.ts";

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void> | void;

/** route → handler. */
export const P1_ROUTES: Record<string, Handler> = {
  "auth-login": authLogin, //             POST /api/auth/login
  "auth-logout": authLogout, //           POST /api/auth/logout
  "auth-me": authMe, //                   GET  /api/auth/me
  "violations-list": violationsList, //   GET  /api/violations
  "violation-detail": violationDetail, // GET  /api/violations/:id
  "violation-review": violationReview, // POST /api/violations/:id/review
  "citizen-register": citizenRegister, // POST /api/citizen/register
  "citizen-resend": citizenResend, // POST /api/citizen/register/resend
  "citizen-verify": citizenVerify, // POST /api/citizen/register/verify
  "citizen-login": citizenLogin, // POST /api/citizen/login
  "citizen-logout": citizenLogout, // POST /api/citizen/logout
  "citizen-me": citizenMe, // GET  /api/citizen/me
  "citizen-password": citizenPassword, // POST /api/citizen/password
  "citizen-fines": citizenFines, // GET  /api/citizen/fines
  "citizen-fine": citizenFine, // GET  /api/citizen/fines/:id
  "citizen-appeal": citizenAppeal, // POST /api/citizen/fines/:id/appeal
  "citizen-vehicles": citizenVehicles, // GET  /api/citizen/vehicles
  "admin-invitations": adminInvitations, // GET/POST /api/admin/officer-invitations
  "admin-invitation-revoke": adminInvitationRevoke, // POST /api/admin/officer-invitations/:id/revoke
  "admin-officers": adminOfficers, // GET  /api/admin/officers
  "admin-officer-active": adminOfficerActive, // POST /api/admin/officers/:id/active
  "officer-invitation": officerInvitation, // POST /api/officer/invitation/check
  "officer-accept": officerAccept, // POST /api/officer/invitation/accept
  "officer-login": officerLogin, // POST /api/officer/login
};

export default function p1(req: VercelRequest, res: VercelResponse) {
  const route = req.query["route"];
  // hasOwnProperty: `P1_ROUTES["constructor"]` existiría por herencia y se ejecutaría en vez de responder 404.
  const fn = typeof route === "string" && Object.prototype.hasOwnProperty.call(P1_ROUTES, route) ? P1_ROUTES[route] : undefined;
  if (!fn) return sendError(res, "NOT_FOUND", "Ruta no encontrada");
  return fn(req, res);
}
